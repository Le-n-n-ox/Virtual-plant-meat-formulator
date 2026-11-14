"""Texture prediction service: approved models only, applicability checked every time.

Behaviour contract:

* No approved model for a requested target -> ``ApiError(422, "model_unavailable")``.
* Missing input features -> no number for that target (``reason: missing_features``) and a
  ``missing_features`` warning. Inputs are never imputed.
* Out of domain -> NO number. Tree ensembles return flat plateau values outside their
  training range, so an extrapolated value is an artifact, not an estimate. The result
  carries ``reason: out_of_domain``, the violated ranges and ``nearest_evidence`` (the
  closest published sample groups with their measured ranges) for comparison, plus an
  ``out_of_domain`` warning.
* Every result is labelled ``literature_derived_estimate``.
"""

from collections.abc import Callable, Iterable, Mapping
from typing import Any

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import Settings
from app.db.models import Experiment, Measurement, Sample
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
            check = check_domain(x, row.applicability_domain)
            domain = {
                "distance": check.distance,
                "threshold": check.threshold,
                "violations": check.violations,
                "nearest_groups": check.nearest_groups,
            }
            if not check.in_domain:
                evidence = self._nearest_evidence(target, check.nearest_groups)
                predictions.append(
                    {
                        **base,
                        "in_domain": False,
                        "reason": "out_of_domain",
                        "domain": domain,
                        "nearest_evidence": evidence,
                    }
                )
                warnings.append(
                    {
                        "code": "out_of_domain",
                        "message": (
                            f"No supported {target} estimate: this blend is outside the range "
                            "of the published samples the model was trained on. The nearest "
                            "published samples are listed for comparison only."
                        ),
                        "details": {
                            "target": target,
                            "model_id": row.id,
                            "violations": check.violations,
                            "distance": check.distance,
                            "threshold": check.threshold,
                            "nearest_evidence": evidence,
                        },
                    }
                )
                continue
            artifact = load_model(row.artifact_uri)
            value, low, high = artifact.predict(x)[0]
            predictions.append(
                {
                    **base,
                    "value": value,
                    "interval": [low, high],
                    "interval_level": float(row.interval_level or artifact.interval_level),
                    "in_domain": True,
                    "domain": domain,
                }
            )
        return {"predictions": predictions, "warnings": warnings}

    def _nearest_evidence(
        self, target: str, nearest_groups: list[dict[str, Any]], limit: int = 3
    ) -> list[dict[str, Any]]:
        """Measured ranges of the closest published sample groups (comparison, not prediction)."""
        evidence: list[dict[str, Any]] = []
        for item in nearest_groups[:limit]:
            label = str(item.get("group", ""))
            number, _, name = label.partition(":")
            row = self.session.execute(
                select(
                    func.count(Measurement.id),
                    func.min(Measurement.value),
                    func.max(Measurement.value),
                    func.min(Measurement.unit),
                    func.min(Experiment.name),
                )
                .join(Sample, Sample.id == Measurement.sample_id)
                .join(Experiment, Experiment.id == Sample.experiment_id)
                .where(
                    Sample.group_id == f"foodml2023-g{number}",
                    Measurement.property == target,
                    Measurement.source_type.in_(("measured", "published")),
                )
            ).one()
            entry: dict[str, Any] = {"group": name or label, "distance": item.get("distance")}
            if row[0]:
                entry.update(
                    {
                        "n_samples": int(row[0]),
                        "measured_min": float(row[1]),
                        "measured_max": float(row[2]),
                        "unit": row[3],
                        "source": row[4],
                    }
                )
            evidence.append(entry)
        return evidence

    def domain_ranges(self, targets: Iterable[str]) -> dict[str, tuple[float, float]]:
        """Per-feature training range shared by the approved models for ``targets``."""
        ranges: dict[str, tuple[float, float]] = {}
        for row in self.require_models(targets).values():
            for name, stats in (row.applicability_domain or {}).get("features", {}).items():
                low, high = float(stats["min"]), float(stats["max"])
                if name in ranges:
                    low, high = max(low, ranges[name][0]), min(high, ranges[name][1])
                ranges[name] = (low, high)
        return ranges

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
