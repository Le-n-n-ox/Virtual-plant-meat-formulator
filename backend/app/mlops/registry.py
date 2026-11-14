"""Model registry operations: register, approve, retire, serve metadata.

Only approved models serve predictions. Retraining never overwrites a model; it creates a
new version. Approval is a human admin action; nothing here approves automatically.
"""

import logging
import math
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import Settings, get_settings
from app.core.ids import iso, new_id, utcnow
from app.db.models import ModelRegistry
from app.mlops.datasets import TARGETS, DatasetUnavailableError, load_hme_dataset
from app.mlops.training import TrainingOutcome, train_target

logger = logging.getLogger(__name__)


def jsonable(value: Any) -> Any:
    """Make nested metrics JSON-safe (numpy scalars to float, NaN/inf to None)."""
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(v) for v in value]
    if hasattr(value, "item") and not isinstance(value, str | bytes):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _get(session: Session, model_id: str) -> ModelRegistry:
    row = session.get(ModelRegistry, model_id)
    if row is None:
        raise ApiError(404, "not_found", "Model not found.", {"model_id": model_id})
    return row


def register_outcome(
    session: Session,
    outcome: TrainingOutcome,
    *,
    target: str,
    dataset_version: str,
    artifact_dir: str,
    training_sources: list[dict[str, Any]],
    mlflow_run_id: str | None = None,
    is_test_model: bool = False,
) -> ModelRegistry:
    """Save the artifact and add a ``candidate`` row with the next version for the target."""
    model_id = new_id("mdl")
    latest = session.scalars(
        select(ModelRegistry.version).where(ModelRegistry.target == target)
    ).all()
    version = str(max((int(v) for v in latest if str(v).isdigit()), default=0) + 1)
    path = Path(artifact_dir) / f"{model_id}.joblib"
    outcome.model.save(path)
    holdout = dict(outcome.holdout_metrics)
    holdout["eligibility"] = outcome.eligibility
    row = ModelRegistry(
        id=model_id,
        target=target,
        unit=outcome.unit,
        algorithm=outcome.algorithm,
        version=version,
        mlflow_run_id=mlflow_run_id,
        status="candidate",
        training_set_size=outcome.training_set_size,
        holdout_metrics=jsonable(holdout),
        feature_schema=jsonable(outcome.feature_schema),
        applicability_domain=jsonable(outcome.applicability_domain),
        limitations=outcome.limitations,
        dataset_version=dataset_version,
        artifact_uri=str(path),
        interval_level=Decimal(str(outcome.model.interval_level)),
        training_sources=jsonable(training_sources),
        is_test_model=is_test_model,
    )
    session.add(row)
    session.flush()
    return row


def approve_model(session: Session, model_id: str, approver_id: str) -> ModelRegistry:
    row = _get(session, model_id)
    if row.status == "retired":
        raise ApiError(
            409, "conflict", "A retired model cannot be re-approved.", {"model_id": model_id}
        )
    problems: dict[str, str] = {}
    if not (row.dataset_version or "").strip():
        problems["dataset_version"] = "A dataset version is required."
    if not (row.limitations or "").strip():
        problems["limitations"] = "A limitations statement is required."
    if row.is_test_model and not get_settings().is_test:
        problems["is_test_model"] = "Test models can only be approved when ENV=test."
    if problems:
        raise ApiError(422, "validation_failed", "Model cannot be approved.", problems)
    if row.status == "approved":
        return row
    for other in session.scalars(
        select(ModelRegistry).where(
            ModelRegistry.target == row.target,
            ModelRegistry.status == "approved",
            ModelRegistry.id != row.id,
        )
    ):
        other.status = "retired"
    row.status = "approved"
    row.approved_by = approver_id
    row.approved_at = utcnow()
    session.flush()
    return row


def retire_model(session: Session, model_id: str) -> ModelRegistry:
    row = _get(session, model_id)
    row.status = "retired"
    session.flush()
    return row


def get_approved_model(session: Session, target: str) -> ModelRegistry | None:
    query = select(ModelRegistry).where(
        ModelRegistry.target == target, ModelRegistry.status == "approved"
    )
    if not get_settings().is_test:
        query = query.where(ModelRegistry.is_test_model.is_(False))
    return session.scalars(query.order_by(ModelRegistry.approved_at.desc())).first()


def _holdout_value(row: ModelRegistry) -> float | None:
    rmse = (row.holdout_metrics or {}).get("rmse")
    if isinstance(rmse, dict):
        return rmse.get("mean")
    return rmse if isinstance(rmse, int | float) else None


def model_meta(row: ModelRegistry) -> dict[str, Any]:
    return {
        "id": row.id,
        "target": row.target,
        "algorithm": row.algorithm,
        "version": row.version,
        "training_set_size": row.training_set_size,
        "holdout_metric": {"name": "rmse", "value": _holdout_value(row)},
        "status": row.status,
        "dataset_version": row.dataset_version,
        "approved_at": iso(row.approved_at),
        "unit": row.unit,
        "interval_level": float(row.interval_level) if row.interval_level is not None else None,
    }


def domain_summary(domain: dict[str, Any] | None) -> dict[str, Any]:
    """Ranges and threshold without the raw training points."""
    domain = domain or {}
    return {
        "method": domain.get("method"),
        "features": domain.get("features", {}),
        "distance_threshold": domain.get("distance_threshold"),
        "distance_percentile": domain.get("distance_percentile"),
        "distance_basis": domain.get("distance_basis"),
        "n_training_points": domain.get("n_training_points"),
        "groups": domain.get("groups", []),
    }


def model_detail(row: ModelRegistry) -> dict[str, Any]:
    detail = model_meta(row)
    detail.update(
        {
            "limitations": row.limitations,
            "feature_schema": row.feature_schema,
            "applicability_domain": domain_summary(row.applicability_domain),
            "holdout_metrics": row.holdout_metrics,
            "training_sources": row.training_sources,
            "is_test_model": row.is_test_model,
            "evidence_basis": "literature_derived_estimate",
        }
    )
    return detail


def ensure_literature_models(session: Session, settings: Settings) -> list[ModelRegistry]:
    """Idempotent bootstrap: train and register candidates for targets with no rows.

    Registered models are candidates only; an admin must approve them.
    """
    created: list[ModelRegistry] = []
    missing = [
        t
        for t in TARGETS
        if not session.scalar(
            select(func.count()).select_from(ModelRegistry).where(ModelRegistry.target == t)
        )
    ]
    if not missing:
        return created
    try:
        dataset = load_hme_dataset(settings.data_dir)
    except DatasetUnavailableError:
        logger.warning("Literature texture data unavailable; no models bootstrapped.")
        return created
    for target in missing:
        outcome = train_target(
            target, dataset, seed=42, min_training_samples=settings.min_training_samples
        )
        created.append(
            register_outcome(
                session,
                outcome,
                target=target,
                dataset_version=dataset.dataset_version,
                artifact_dir=settings.model_artifact_dir,
                training_sources=dataset.sources,
                is_test_model=False,
            )
        )
    return created
