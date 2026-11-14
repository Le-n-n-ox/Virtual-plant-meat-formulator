"""Moisture-basis conversion between dry-matter and as-is values."""

from dataclasses import replace
from decimal import Decimal

from app.domain.types import IngredientData, NutrientRow
from app.domain.units import canonical_unit, convert

_HUNDRED = Decimal(100)


class BasisError(ValueError):
    """Raised when a value's moisture basis cannot be reconciled."""


def dry_to_as_is(value: Decimal, moisture_percent: Decimal) -> Decimal:
    """c_as_is = c_dry * (1 - m/100)."""
    return value * (1 - moisture_percent / _HUNDRED)


def as_is_to_dry(value: Decimal, moisture_percent: Decimal) -> Decimal:
    """Inverse of :func:`dry_to_as_is`; fails at 100 % moisture."""
    factor = 1 - moisture_percent / _HUNDRED
    if factor == 0:
        raise BasisError("Cannot express a 100% moisture material on a dry basis")
    return value / factor


def normalize_row(
    row: NutrientRow, ingredient: IngredientData, target_unit: str | None = None
) -> NutrientRow:
    """Return ``row`` as per 100 g as-is in ``target_unit`` (value and range converted)."""
    unit = canonical_unit(target_unit or row.unit)
    moisture = ingredient.moisture_percent
    is_dry = row.per_basis == "per_100g_dry"
    if is_dry and moisture is None:
        raise BasisError(
            f"Ingredient {ingredient.id} has a dry-basis {row.key} value but no moisture_percent"
        )

    def conv(v: Decimal | None) -> Decimal | None:
        if v is None:
            return None
        if is_dry and moisture is not None:
            v = dry_to_as_is(v, moisture)
        return convert(v, row.unit, unit)

    return replace(
        row,
        value=conv(row.value),
        unit=unit,
        range_low=conv(row.range_low),
        range_high=conv(row.range_high),
        per_basis="per_100g_as_is",
    )
