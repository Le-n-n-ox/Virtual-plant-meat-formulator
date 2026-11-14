"""Grouped cross-validated training of texture estimators.

Folds always hold out whole source groups (never random rows). Intervals are 90% and
their empirical coverage on held-out folds is reported next to accuracy.
"""

import math
import warnings
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sklearn.base import BaseEstimator
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold, LeaveOneGroupOut
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.domain.texture.applicability_domain import fit_domain
from app.domain.texture.features import default_feature_schema
from app.domain.texture.models import (
    INTERVAL_LEVEL,
    Z_90,
    TextureModel,
    conformal_quantile,
)
from app.mlops.datasets import TextureDataset

BASELINES = ("mean_baseline", "ridge")
COMPARED = ("random_forest", "gradient_boosting", "gaussian_process")
ALGORITHMS = (*BASELINES, *COMPARED)
CALC_VERSION = "texture-train-1"


class TrainingCancelled(Exception):
    """Raised when ``cancel_cb`` requests a stop between folds."""


class TrainingError(ValueError):
    """The data cannot support the requested training run."""


@dataclass
class TrainingOutcome:
    target: str
    unit: str
    model: TextureModel
    algorithm: str
    candidates: dict[str, dict[str, Any]]
    holdout_metrics: dict[str, Any]
    feature_schema: dict[str, Any]
    applicability_domain: dict[str, Any]
    eligibility: dict[str, Any]
    limitations: str
    training_set_size: int
    n_groups: int
    seed: int
    cv: str
    group_splits: list[list[str]] = field(default_factory=list)

    @property
    def candidate_metrics(self) -> dict[str, dict[str, Any]]:
        """Alias of ``candidates`` (metrics for every compared algorithm)."""
        return self.candidates


def make_estimator(name: str, seed: int) -> BaseEstimator:
    if name == "mean_baseline":
        return DummyRegressor(strategy="mean")
    if name == "ridge":
        return make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    if name == "random_forest":
        return RandomForestRegressor(
            n_estimators=100, min_samples_leaf=2, random_state=seed, n_jobs=1
        )
    if name == "gradient_boosting":
        return GradientBoostingRegressor(
            n_estimators=100, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=seed
        )
    if name == "gaussian_process":
        kernel = ConstantKernel(1.0, (1e-2, 1e2)) * RBF(1.0, (1e-1, 1e2)) + WhiteKernel(
            0.1, (1e-3, 1e1)
        )
        return make_pipeline(
            StandardScaler(),
            GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=seed),
        )
    raise ValueError(f"Unknown algorithm {name}")


def make_splitter(groups: list[str]) -> tuple[Any, str]:
    n_groups = len(set(groups))
    if n_groups <= 8:
        return LeaveOneGroupOut(), "LeaveOneGroupOut"
    k = min(5, n_groups)
    return GroupKFold(n_splits=k), f"GroupKFold({k})"


def _fit(name: str, seed: int, X: np.ndarray, y: np.ndarray) -> BaseEstimator:
    est = make_estimator(name, seed)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        est.fit(X, y)
    return est


def _predict_interval(
    name: str, est: BaseEstimator, X: np.ndarray, q: float | None
) -> tuple[np.ndarray, np.ndarray]:
    """Return (mean, half_width) at the 90% level."""
    if name == "gaussian_process":
        mean, std = est.predict(X, return_std=True)
        return np.asarray(mean), Z_90 * np.asarray(std)
    mean = est.predict(X)
    return np.asarray(mean), np.full(len(X), float(q))  # type: ignore[arg-type]


def _oof_residuals(
    name: str, seed: int, X: np.ndarray, y: np.ndarray, groups: np.ndarray
) -> np.ndarray:
    """Absolute out-of-fold residuals from grouped CV inside the given (training) rows."""
    if len(set(groups.tolist())) < 2:
        raise TrainingError("Need at least two source groups to calibrate intervals.")
    splitter, _ = make_splitter(groups.tolist())
    res: list[float] = []
    for tr, te in splitter.split(X, y, groups):
        est = _fit(name, seed, X[tr], y[tr])
        res.extend(np.abs(y[te] - est.predict(X[te])).tolist())
    return np.array(res)


def _rmse(y: np.ndarray, p: np.ndarray) -> float:
    return float(math.sqrt(np.mean((y - p) ** 2)))


def _summ(values: Sequence[float | None]) -> dict[str, float | None]:
    arr = np.array([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    if len(arr) == 0:
        return {"mean": None, "std": None}
    return {"mean": float(arr.mean()), "std": float(arr.std())}


def _r2(y: np.ndarray, p: np.ndarray) -> float | None:
    ss_tot = float(((y - y.mean()) ** 2).sum())
    if len(y) < 2 or ss_tot <= 1e-12:
        return None
    return 1.0 - float(((y - p) ** 2).sum()) / ss_tot


def limitations_text(
    target: str, unit: str, n: int, n_groups: int, dataset_version: str | None = None
) -> str:
    chew = (
        " Chewiness is in the unit reported by the source study ('" + unit + "'), "
        "which may not be a true energy unit."
        if target == "chewiness"
        else ""
    )
    return (
        f"Literature-derived estimate. Trained on {n} literature high-moisture-extrusion "
        f"samples from {n_groups} source groups (two studies), mostly pea, faba and soy "
        "isolates and concentrates, with wheat-gluten blends. Composition-only (six "
        "proximate inputs plus target moisture); extrusion temperature, screw speed and "
        "die are not model inputs. Validated only by leave-whole-group-out cross-validation "
        "on this literature data; not validated on Kenyan whole-food blends or locally "
        "measured texture, and not calibrated to any local instrument or method."
        + chew
        + " Outside the training ranges the model gives no supported prediction."
    )


def train_target(
    target: str,
    dataset: TextureDataset,
    *,
    seed: int,
    min_training_samples: int,
    progress_cb: Callable[[int, int], None] | None = None,
    cancel_cb: Callable[[], bool] | None = None,
) -> TrainingOutcome:
    if target not in dataset.y:
        raise TrainingError(f"Unknown target {target!r}.")
    y_all = np.array(dataset.y[target], dtype=float)
    keep = np.isfinite(y_all)
    X = dataset.X.to_numpy(dtype=float)[keep]
    y = y_all[keep]
    groups = np.array([g for g, k in zip(dataset.groups, keep, strict=True) if k])
    n = len(y)
    n_groups = len(set(groups.tolist()))
    if n_groups < 3:
        raise TrainingError("Need at least three source groups for grouped cross-validation.")
    unit = dataset.units.get(target, "")
    splitter, cv_name = make_splitter(groups.tolist())
    folds = list(splitter.split(X, y, groups))
    for tr, te in folds:  # a held-out group never appears in its own training fold
        assert not set(groups[tr].tolist()) & set(groups[te].tolist())
    total = len(ALGORITHMS) * len(folds)
    done = 0

    per_algo: dict[str, dict[str, Any]] = {}
    oof: dict[str, np.ndarray] = {}
    for name in ALGORITHMS:
        rmses: list[float] = []
        maes: list[float] = []
        r2s: list[float | None] = []
        hits = 0
        pred_oof = np.zeros(n)
        for tr, te in folds:
            if cancel_cb is not None and cancel_cb():
                raise TrainingCancelled()
            est = _fit(name, seed, X[tr], y[tr])
            q = None
            if name != "gaussian_process":
                q = conformal_quantile(_oof_residuals(name, seed, X[tr], y[tr], groups[tr]))
            mean, half = _predict_interval(name, est, X[te], q)
            pred_oof[te] = mean
            rmses.append(_rmse(y[te], mean))
            maes.append(float(np.mean(np.abs(y[te] - mean))))
            r2s.append(_r2(y[te], mean))
            hits += int(np.sum((y[te] >= mean - half) & (y[te] <= mean + half)))
            done += 1
            if progress_cb is not None:
                progress_cb(done, total)
        coverage = hits / n
        per_algo[name] = {
            "rmse": _summ(rmses),
            "mae": _summ(maes),
            "r2": _summ(r2s),
            "r2_pooled": _r2(y, pred_oof),
            "coverage_90": coverage,
            "n_folds": len(folds),
        }
        oof[name] = pred_oof

    chosen = min(COMPARED, key=lambda a: per_algo[a]["rmse"]["mean"])
    base_rmse = per_algo["mean_baseline"]["rmse"]["mean"]
    chosen_rmse = per_algo[chosen]["rmse"]["mean"]
    coverage = per_algo[chosen]["coverage_90"]
    eligibility = {
        "beats_baselines": bool(chosen_rmse < base_rmse),
        "coverage_ok": bool(abs(coverage - INTERVAL_LEVEL) <= 0.1),
        "enough_samples": bool(n >= min_training_samples),
        "beats_ridge": bool(chosen_rmse < per_algo["ridge"]["rmse"]["mean"]),
        "min_training_samples": min_training_samples,
    }
    eligibility["eligible"] = bool(
        eligibility["beats_baselines"]
        and eligibility["coverage_ok"]
        and eligibility["enough_samples"]
    )

    # Final model on all rows; conformal quantile from the grouped out-of-fold residuals.
    final = _fit(chosen, seed, X, y)
    residuals = np.abs(y - oof[chosen])
    if chosen == "gaussian_process":
        method, q_final = "gp_std", None
    else:
        method, q_final = "conformal_group_cv", conformal_quantile(residuals)
    model = TextureModel(
        estimator=final,
        feature_names=list(dataset.X.columns),
        target=target,
        unit=unit,
        algorithm=chosen,
        interval_method=method,
        interval_level=INTERVAL_LEVEL,
        conformal_quantile=q_final,
        residuals=[float(r) for r in residuals],
    )
    domain = fit_domain(X, list(dataset.X.columns), groups.tolist())
    chosen_m = per_algo[chosen]
    holdout = {
        "rmse": chosen_m["rmse"],
        "mae": chosen_m["mae"],
        "r2": chosen_m["r2"],
        "r2_pooled": chosen_m["r2_pooled"],
        "coverage_90": chosen_m["coverage_90"],
        "cv": cv_name,
        "n_folds": len(folds),
        "interval_method": method,
        "baselines": {b: per_algo[b] for b in BASELINES},
        "candidates": per_algo,
        "seed": seed,
        "calc_version": CALC_VERSION,
    }
    return TrainingOutcome(
        target=target,
        unit=unit,
        model=model,
        algorithm=chosen,
        candidates=per_algo,
        holdout_metrics=holdout,
        feature_schema=default_feature_schema(),
        applicability_domain=domain,
        eligibility=eligibility,
        limitations=limitations_text(target, unit, n, n_groups),
        training_set_size=n,
        n_groups=n_groups,
        seed=seed,
        cv=cv_name,
        group_splits=[sorted(set(groups[te].tolist())) for _, te in folds],
    )


__all__ = [
    "ALGORITHMS",
    "TrainingCancelled",
    "TrainingError",
    "TrainingOutcome",
    "limitations_text",
    "train_target",
]
