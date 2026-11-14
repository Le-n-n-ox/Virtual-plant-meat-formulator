"""Deterministic nutrition engine: C_n = sum_i p_i/100 * c_i,n (guide section 8.1)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.domain.moisture import normalize_row
from app.domain.types import PROXIMATE_KEYS, IngredientData, Line

CALC_VERSION = "nutrition-1.0.0"
_HUNDRED = Decimal(100)


@dataclass
class NutrientResult:
    key: str
    value: Decimal | None
    unit: str
    flag: str = "calculated"
    range: tuple[Decimal, Decimal] | None = None
    contains_estimated: bool = False
    missing_ingredient_ids: list[str] = field(default_factory=list)
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "key": self.key,
            "value": None if self.value is None else float(self.value),
            "unit": self.unit,
            "flag": self.flag,
        }
        if self.range is not None:
            out["range"] = [float(self.range[0]), float(self.range[1])]
        out["contains_estimated"] = self.contains_estimated
        out["missing_ingredient_ids"] = list(self.missing_ingredient_ids)
        if self.reason is not None:
            out["reason"] = self.reason
        return out


@dataclass
class NutritionResult:
    nutrients: list[NutrientResult]
    basis: str = "per_100g_as_formulated"

    def to_payload(self) -> dict[str, Any]:
        return {"basis": self.basis, "nutrients": [n.to_dict() for n in self.nutrients]}

    def get(self, key: str) -> NutrientResult | None:
        return next((n for n in self.nutrients if n.key == key), None)


def calculate_nutrition(
    lines: Sequence[Line],
    ingredients: Mapping[str, IngredientData],
    nutrient_units: Mapping[str, str],
) -> NutritionResult:
    """Per-100 g as-formulated values; None (never a partial sum) if any data is missing."""
    active = [ln for ln in lines if ln.percent > 0]
    results: list[NutrientResult] = []
    for key, unit in nutrient_units.items():
        total = low = high = Decimal(0)
        has_range = True
        estimated = False
        missing: list[str] = []
        out_unit = unit
        for ln in active:
            ing = ingredients.get(ln.ingredient_id)
            row = ing.nutrients.get(key) if ing else None
            if ing is None or row is None or row.value is None:
                if ln.ingredient_id not in missing:
                    missing.append(ln.ingredient_id)
                continue
            norm = normalize_row(row, ing, unit)
            out_unit = norm.unit
            weight = ln.percent / _HUNDRED
            total += weight * (norm.value or Decimal(0))
            estimated = estimated or row.flag == "estimated"
            if norm.range_low is None or norm.range_high is None:
                has_range = False
            else:
                low += weight * norm.range_low
                high += weight * norm.range_high
        if missing or not active:
            results.append(
                NutrientResult(
                    key,
                    None,
                    out_unit,
                    contains_estimated=estimated,
                    missing_ingredient_ids=missing,
                    reason="missing_data",
                )
            )
        else:
            results.append(
                NutrientResult(
                    key,
                    total,
                    out_unit,
                    range=(low, high) if has_range else None,
                    contains_estimated=estimated,
                )
            )
    return NutritionResult(results)


def blend_composition(
    lines: Sequence[Line],
    ingredients: Mapping[str, IngredientData],
    keys: Sequence[str] = PROXIMATE_KEYS,
) -> dict[str, Decimal | None]:
    """Grams per 100 g as formulated for ``keys``; None if any contributor lacks the value."""
    res = calculate_nutrition(lines, ingredients, dict.fromkeys(keys, "g"))
    return {k: (n.value if (n := res.get(k)) else None) for k in keys}


def linear_coefficients(
    ingredients: Mapping[str, IngredientData],
    ingredient_ids: Sequence[str],
    key: str,
    unit: str,
) -> list[Decimal | None]:
    """Per-ingredient value of ``key`` per 100 g as-is in ``unit`` (None if missing)."""
    out: list[Decimal | None] = []
    for ing_id in ingredient_ids:
        ing = ingredients.get(ing_id)
        row = ing.nutrients.get(key) if ing else None
        if ing is None or row is None or row.value is None:
            out.append(None)
        else:
            out.append(normalize_row(row, ing, unit).value)
    return out
