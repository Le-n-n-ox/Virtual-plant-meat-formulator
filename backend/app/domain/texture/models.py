"""Fitted texture model wrapper with prediction intervals, persistence and a load cache."""

import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

INTERVAL_LEVEL = 0.9
Z_90 = 1.645


def conformal_quantile(abs_residuals: np.ndarray, level: float = INTERVAL_LEVEL) -> float:
    """Finite-sample-corrected quantile of absolute residuals."""
    r = np.sort(np.asarray(abs_residuals, dtype=float))
    n = len(r)
    if n == 0:
        return float("inf")
    k = min(n, math.ceil((n + 1) * level))
    return float(r[k - 1])


@dataclass
class TextureModel:
    estimator: Any
    feature_names: list[str]
    target: str
    unit: str
    algorithm: str
    interval_method: str  # gp_std | conformal_group_cv
    interval_level: float = INTERVAL_LEVEL
    conformal_quantile: float | None = None
    residuals: list[float] = field(default_factory=list)
    non_negative: bool = True

    def predict(self, X: np.ndarray) -> list[tuple[float, float, float]]:
        """Return ``(value, low, high)`` per row; intervals are at ``interval_level``."""
        X = np.asarray(X, dtype=float).reshape(-1, len(self.feature_names))
        if self.interval_method == "gp_std":
            mean, std = self.estimator.predict(X, return_std=True)
            half = Z_90 * np.asarray(std)
        else:
            mean = self.estimator.predict(X)
            half = np.full(len(X), float(self.conformal_quantile or 0.0))
        out = []
        for m, h in zip(np.asarray(mean), half, strict=True):
            value, low, high = float(m), float(m - h), float(m + h)
            if self.non_negative:
                value, low, high = max(value, 0.0), max(low, 0.0), max(high, 0.0)
            out.append((value, low, high))
        return out

    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: str | Path) -> TextureModel:
        # Artifacts are produced only by our own registry; never load untrusted files.
        model = joblib.load(path)
        if not isinstance(model, TextureModel):
            raise ValueError("Artifact is not a TextureModel.")
        return model


@lru_cache(maxsize=16)
def load_model(artifact_uri: str) -> TextureModel:
    return TextureModel.load(artifact_uri)
