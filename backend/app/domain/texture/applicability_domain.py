"""Applicability domain: per-feature ranges plus a standardized nearest-neighbour distance.

A point is in domain only if every feature lies inside the training range and its
standardized distance to the nearest training point does not exceed the threshold. The
threshold is the 95th percentile of leave-one-group-out nearest-neighbour distances (the
distance from each training point to the nearest point of a *different* source group).
Plain leave-one-out would be near zero because rows within a group are near duplicates
and would flag every genuinely new formulation.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np

_TOL = 1e-9


@dataclass
class DomainCheck:
    in_domain: bool
    violations: list[dict[str, Any]] = field(default_factory=list)
    distance: float = 0.0
    threshold: float = 0.0
    nearest_groups: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "in_domain": self.in_domain,
            "violations": self.violations,
            "distance": self.distance,
            "threshold": self.threshold,
            "nearest_groups": self.nearest_groups,
        }


def fit_domain(X: np.ndarray, feature_names: list[str], groups: list[str]) -> dict[str, Any]:
    X = np.asarray(X, dtype=float)
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std_safe = np.where(std > 1e-12, std, 1.0)
    Z = (X - mean) / std_safe
    labels = [str(g) for g in groups]
    label_arr = np.array(labels)
    dists = np.sqrt(((Z[:, None, :] - Z[None, :, :]) ** 2).sum(axis=2))
    loo: list[float] = []
    for i in range(len(Z)):
        mask = label_arr != label_arr[i]
        if not mask.any():
            mask = np.arange(len(Z)) != i
        if mask.any():
            loo.append(float(dists[i, mask].min()))
    threshold = float(np.percentile(loo, 95)) if loo else 0.0
    return {
        "method": "range_and_standardized_knn",
        "feature_names": list(feature_names),
        "features": {
            name: {
                "min": float(X[:, j].min()),
                "max": float(X[:, j].max()),
                "mean": float(mean[j]),
                "std": float(std[j]),
            }
            for j, name in enumerate(feature_names)
        },
        "distance_threshold": threshold,
        "distance_percentile": 95,
        "distance_basis": "leave_one_group_out_nearest_neighbour",
        "n_training_points": int(len(X)),
        "training_points": Z.round(10).tolist(),
        "training_groups": labels,
        "groups": sorted(set(labels)),
    }


def check_domain(x: np.ndarray, domain: Mapping[str, Any]) -> DomainCheck:
    x = np.asarray(x, dtype=float).reshape(-1)
    names = list(domain["feature_names"])
    violations: list[dict[str, Any]] = []
    means = np.array([domain["features"][n]["mean"] for n in names])
    stds = np.array([domain["features"][n]["std"] for n in names])
    stds = np.where(stds > 1e-12, stds, 1.0)
    for j, name in enumerate(names):
        lo, hi = domain["features"][name]["min"], domain["features"][name]["max"]
        value = float(x[j])
        if not np.isfinite(value) or value < lo - _TOL or value > hi + _TOL:
            violations.append({"feature": name, "value": value, "min": lo, "max": hi})
    z = (x - means) / stds
    points = np.asarray(domain["training_points"], dtype=float)
    d = np.sqrt(((points - z) ** 2).sum(axis=1))
    best: dict[str, float] = {}
    for dist, group in zip(d, domain["training_groups"], strict=True):
        if group not in best or dist < best[group]:
            best[group] = float(dist)
    nearest = [
        {"group": g, "distance": v} for g, v in sorted(best.items(), key=lambda kv: kv[1])[:3]
    ]
    distance = float(d.min()) if len(d) else float("inf")
    threshold = float(domain["distance_threshold"])
    in_domain = not violations and distance <= threshold + _TOL
    return DomainCheck(
        in_domain=in_domain,
        violations=violations,
        distance=distance,
        threshold=threshold,
        nearest_groups=nearest,
    )
