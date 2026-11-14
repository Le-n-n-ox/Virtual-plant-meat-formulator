"""Objective model and parsing for the optimizer."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from app.domain.optimization.constraints import ParamsError

# Documented examples; any "<nutrient>_<g|mg|ug>_per_100g" target is accepted too.
NUTRIENT_TARGETS = frozenset(
    {
        "protein_g_per_100g",
        "fat_g_per_100g",
        "fibre_g_per_100g",
        "carbohydrate_available_g_per_100g",
        "ash_g_per_100g",
        "energy_kcal_per_100g",
        "energy_kj_per_100g",
        "amino_acid_score",
        "cost_per_kg",
    }
)
_NUTRIENT_RE = re.compile(r"^(?P<key>[a-z0-9_]+?)_(?P<unit>g|mg|ug)_per_100g$")
_ENERGY_RE = re.compile(r"^(?P<key>energy_kj|energy_kcal)_per_100g$")
_DIRECTIONS = ("maximize", "minimize", "target")


@dataclass
class Objective:
    target: str
    direction: Literal["maximize", "minimize", "target"]
    value: float | None = None
    unit: str | None = None
    weight: float = 1.0


def nutrient_target_spec(target: str) -> tuple[str, str] | None:
    """(nutrient key, unit) for a nutrient-per-100g target, else None."""
    m = _ENERGY_RE.match(target)
    if m:
        return m["key"], "kJ" if m["key"] == "energy_kj" else "kcal"
    m = _NUTRIENT_RE.match(target)
    if m:
        return m["key"], m["unit"]
    return None


def is_texture_target(target: str) -> bool:
    """Anything that is not a nutrient, cost or amino-acid-score target needs a predictor."""
    return (
        target not in ("cost_per_kg", "amino_acid_score") and nutrient_target_spec(target) is None
    )


def is_linear(objective: Objective) -> bool:
    return objective.target != "amino_acid_score" and not is_texture_target(objective.target)


def parse_objectives(items: Iterable[Mapping[str, Any]] | None) -> list[Objective]:
    out: list[Objective] = []
    issues: list[dict[str, Any]] = []
    for i, it in enumerate(items or []):
        f = f"objectives[{i}]"
        if not isinstance(it, Mapping) or not it.get("target"):
            issues.append({"code": "required", "message": "target is required", "field": f})
            continue
        direction = it.get("direction")
        if direction not in _DIRECTIONS:
            issues.append(
                {
                    "code": "invalid_direction",
                    "message": f"direction must be one of {_DIRECTIONS}",
                    "field": f + ".direction",
                }
            )
            continue
        value = it.get("value")
        if direction == "target" and (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            issues.append(
                {
                    "code": "required",
                    "message": "value is required for direction 'target'",
                    "field": f + ".value",
                }
            )
            continue
        weight = it.get("weight", 1.0)
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or weight <= 0:
            issues.append(
                {"code": "invalid_number", "message": "weight must be > 0", "field": f + ".weight"}
            )
            continue
        out.append(
            Objective(
                str(it["target"]),
                direction,
                float(value) if value is not None else None,
                it.get("unit"),
                float(weight),
            )
        )
    if issues:
        raise ParamsError(issues)
    return out
