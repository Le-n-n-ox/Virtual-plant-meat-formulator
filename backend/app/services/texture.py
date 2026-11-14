"""Texture prediction service: approved models only, applicability checked every time.

Behaviour contract:

* No approved model for a requested target -> ``ApiError(422, "model_unavailable")``.
* Missing input features -> no number for that target (``reason: missing_features``) and a
  ``missing_features`` warning. Inputs are never imputed.
* Out of domain -> the model value is still returned so the user can see what the model
  extrapolates, but ``in_domain`` is false, nearest supporting groups are listed, and an
  ``out_of_domain`` warning is emitted. The frontend must show that warning instead of
  presenting a confident number.
* Every result is labelled ``literature_derived_estimate``.
"""

from collections.abc import Callable, Iterable, Mapping
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import Settings
from app.domain.texture.applicability_domain import check_domain
from app.domain.texture.features import build_feature_vector, composition_from_blend
from app.domain.texture.models import load_model
from app.domain.types import ProcessConditions
from app.mlops.datasets import TARGETS
from app.mlops.registry import get_approved_model, model_meta

EVIDENCE_BASIS = "literature_derived_estimate"


class TextureService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def available_targets(self) -> dict[str, Any]:
        found = {}
        for target in TARGETS:
            row = get_approved_model(self.session, target)
            if row is not None:
                found[target] = row
        return found

    def require_models(self, targets: Iterable[str]) -> dict[str, Any]:
        targets = list(targets)
        models: dict[str, Any] = {}
        missing: list[str] = []
        for target in targets:
            row = get_approved_model(self.session, target)
            if row is None:
                missing.append(target)
            else:
                models[target] = row
        if missing:
            raise ApiError(
                422,
                "model_unavailable",
                "No approved model exists for: " + ", ".join(missing) + ".",
                {"targets": missing},
            )
        return models

    def predict(
        self,
        composition: Mapping[str, Any],
        process: ProcessConditions,
        targets: Iterable[str],
    ) -> dict[str, Any]:
        models = self.require_models(targets)
        comp = composition_from_blend(composition)
        predictions: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []
        for target, row in models.items():
            meta = model_meta(row)
            base = {
                "target": target,
                "unit": row.unit,
                "model": {
                    k: meta[k]
                    for k in (
                        "id",
                        "target",
                        "algorithm",
                        "version",
                        "training_set_size",
                        "holdout_metric",
                    )
                },
                "evidence_basis": EVIDENCE_BASIS,
            }
            x, missing = build_feature_vector(comp, process, row.feature_schema)
            if missing:
                predictions.append(
                    {**base, "reason": "missing_features", "missing_features": missing}
                )
                warnings.append(
                    {
                        "code": "missing_features",
                        "message": f"No {target} estimate: missing inputs {', '.join(missing)}.",
                        "details": {"target": target, "missing": missing, "model_id": row.id},
                    }
                )
                continue
            artifact = load_model(row.artifact_uri)
            value, low, high = artifact.predict(x)[0]
            check = check_domain(x, row.applicability_domain)
            predictions.append(
                {
                    **base,
                    "value": value,
                    "interval": [low, high],
                    "interval_level": float(row.interval_level or artifact.interval_level),
                    "in_domain": check.in_domain,
                    "domain": {
                        "distance": check.distance,
                        "threshold": check.threshold,
                        "violations": check.violations,
                        "nearest_groups": check.nearest_groups,
                    },
                }
            )
            if not check.in_domain:
                warnings.append(
                    {
                        "code": "out_of_domain",
                        "message": (
                            f"The {target} value is outside the literature training support and "
                            "is not a supported prediction; see the nearest source groups."
                        ),
                        "details": {
                            "target": target,
                            "model_id": row.id,
                            "violations": check.violations,
                            "distance": check.distance,
                            "threshold": check.threshold,
                            "nearest_groups": check.nearest_groups,
                        },
                    }
                )
        return {"predictions": predictions, "warnings": warnings}

    def predictor_fn(
        self, target: str, process: ProcessConditions
    ) -> Callable[[Mapping[str, Any]], float]:
        """Return ``f(composition) -> value`` for the optimizer (no domain check per call)."""
        row = self.require_models([target])[target]
        artifact = load_model(row.artifact_uri)
        schema = row.feature_schema
        _, missing_process = build_feature_vector({}, process, schema)
        process_only = set(missing_process) & {"target_moisture"}
        if process_only:
            raise ApiError(
                422,
                "validation_failed",
                "Process inputs required by the model are missing.",
                {"missing": sorted(process_only)},
            )

        def predict_one(composition: Mapping[str, Any]) -> float:
            x, missing = build_feature_vector(composition_from_blend(composition), process, schema)
            if missing:
                raise ValueError("Missing texture inputs: " + ", ".join(missing))
            return float(np.asarray(artifact.predict(x)[0][0]))

        return predict_one
