"""Constraint model and parsing for the optimizer (pure domain, no web/DB imports)."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from app.domain.types import IngredientData

_UNIT_ALIASES = {
    "g": "g",
    "g_per_100g": "g",
    "mg": "mg",
    "mg_per_100g": "mg",
    "ug": "ug",
    "ug_per_100g": "ug",
    "mg_per_g_protein": "mg_per_g_protein",
    "kcal": "kcal",
    "kj": "kJ",
    "kJ": "kJ",
}
_MASS_FACTOR_G = {"g": 1.0, "mg": 1e-3, "ug": 1e-6}


class ParamsError(ValueError):
    """Malformed optimization parameters; ``issues`` lists every problem found."""

    def __init__(self, issues: Sequence[Mapping[str, Any]] | str):
        if isinstance(issues, str):
            issues = [{"code": "invalid_params", "message": issues, "field": None}]
        self.issues: list[dict[str, Any]] = [dict(i) for i in issues]
        super().__init__("; ".join(str(i.get("message")) for i in self.issues))


@dataclass
class IngredientBound:
    ingredient_id: str
    min_percent: float = 0.0
    max_percent: float = 100.0


@dataclass
class NutrientLimit:
    key: str
    value: float
    unit: str
    kind: Literal["min", "max"]


@dataclass
class CostCeiling:
    value: float
    currency: str


@dataclass
class ConstraintSet:
    ingredient_bounds: list[IngredientBound] = field(default_factory=list)
    excluded_ingredient_ids: set[str] = field(default_factory=set)
    nutrient_limits: list[NutrientLimit] = field(default_factory=list)
    cost_ceiling: CostCeiling | None = None


def normalize_unit(unit: str | None) -> str:
    if unit is None:
        return "g"
    try:
        return _UNIT_ALIASES[unit]
    except KeyError:
        raise ParamsError(
            [{"code": "invalid_unit", "message": f"Unknown unit {unit!r}", "field": "unit"}]
        ) from None


def convert_amount(value: float, from_unit: str, to_unit: str) -> float:
    """Convert a mass amount between g/mg/ug; other units must match exactly."""
    if from_unit == to_unit:
        return value
    if from_unit in _MASS_FACTOR_G and to_unit in _MASS_FACTOR_G:
        return value * _MASS_FACTOR_G[from_unit] / _MASS_FACTOR_G[to_unit]
    raise ParamsError(
        [
            {
                "code": "unit_mismatch",
                "message": f"Cannot convert {from_unit} to {to_unit}",
                "field": "unit",
            }
        ]
    )


def nutrient_coefficient(ing: IngredientData, key: str, unit: str) -> float | None:
    """Amount of nutrient ``key`` per 100 g of the ingredient as used, in ``unit``.

    None when the value is not reported (never treated as zero).
    """
    row = ing.nutrients.get(key)
    if row is None or row.value is None:
        return None
    val = float(row.value)
    if row.per_basis == "per_100g_dry":
        if ing.moisture_percent is None:
            return None
        val *= 1.0 - float(ing.moisture_percent) / 100.0
    return convert_amount(val, row.unit, unit)


def _issue(code: str, message: str, field_: str | None) -> dict[str, Any]:
    return {"code": code, "message": message, "field": field_}


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    f = float(v)
    return f if math.isfinite(f) else None


def parse_constraints(params_constraints: Mapping[str, Any] | None) -> ConstraintSet:
    """Parse the ``constraints`` block of the optimization job params (guide 6.4)."""
    cs = ConstraintSet()
    if not params_constraints:
        return cs
    issues: list[dict[str, Any]] = []
    src = params_constraints

    for i, b in enumerate(src.get("ingredient_bounds") or []):
        f = f"constraints.ingredient_bounds[{i}]"
        iid = b.get("ingredient_id") if isinstance(b, Mapping) else None
        if not iid:
            issues.append(_issue("required", "ingredient_id is required", f + ".ingredient_id"))
            continue
        lo = _num(b.get("min_percent", 0))
        hi = _num(b.get("max_percent", 100))
        if lo is None or hi is None:
            issues.append(_issue("invalid_number", "min/max percent must be numbers", f))
            continue
        if not (0 <= lo <= 100 and 0 <= hi <= 100):
            issues.append(_issue("out_of_range", "percent bounds must be within 0-100", f))
        elif lo > hi:
            issues.append(_issue("invalid_bounds", f"min_percent {lo:g} exceeds max {hi:g}", f))
        else:
            cs.ingredient_bounds.append(IngredientBound(str(iid), lo, hi))

    ex = src.get("excluded_ingredient_ids") or []
    if not isinstance(ex, (list, tuple, set)):
        issues.append(
            _issue("invalid_type", "excluded_ingredient_ids must be a list", "constraints")
        )
    else:
        cs.excluded_ingredient_ids = {str(e) for e in ex}

    for block, kind in (("nutrient_minimums", "min"), ("nutrient_maximums", "max")):
        for i, item in enumerate(src.get(block) or []):
            f = f"constraints.{block}[{i}]"
            if not isinstance(item, Mapping) or not item.get("key"):
                issues.append(_issue("required", "key is required", f + ".key"))
                continue
            val = _num(item.get(kind))
            if val is None:
                issues.append(_issue("required", f"numeric '{kind}' is required", f"{f}.{kind}"))
                continue
            try:
                unit = normalize_unit(item.get("unit"))
            except ParamsError as e:
                issues.append({**e.issues[0], "field": f + ".unit"})
                continue
            cs.nutrient_limits.append(
                NutrientLimit(str(item["key"]), val, unit, "min" if kind == "min" else "max")
            )

    cc = src.get("cost_ceiling")
    if cc:
        is_map = isinstance(cc, Mapping)
        val = _num(cc.get("value")) if is_map else None
        per = cc.get("per", "kg") if is_map else None
        if val is None or val < 0:
            issues.append(
                _issue(
                    "invalid_number", "cost_ceiling.value must be >= 0", "constraints.cost_ceiling"
                )
            )
        elif per != "kg":
            issues.append(
                _issue(
                    "invalid_unit", "cost_ceiling.per must be 'kg'", "constraints.cost_ceiling.per"
                )
            )
        else:
            cs.cost_ceiling = CostCeiling(val, str(cc.get("currency", "")))

    if issues:
        raise ParamsError(issues)
    return cs
