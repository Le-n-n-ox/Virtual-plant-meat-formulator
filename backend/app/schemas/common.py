"""Shared schema helpers: number conversion, unit conversion and page envelopes."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class Page(BaseModel):
    """Standard paged list envelope (guide section 5)."""

    items: list[Any]
    total: int
    page: int
    page_size: int


def fnum(value: Decimal | float | int | None) -> float | None:
    """Convert a stored NUMERIC to the float the frontend contract expects (None stays None)."""
    return None if value is None else float(value)


# Mass units convert through grams; energy through kJ.
_TO_BASE = {
    "g": Decimal(1),
    "mg": Decimal("0.001"),
    "ug": Decimal("0.000001"),
    "mcg": Decimal("0.000001"),
    "kj": Decimal(1),
    "kcal": Decimal("4.184"),
}
_FAMILY = {"g": "mass", "mg": "mass", "ug": "mass", "mcg": "mass", "kj": "energy", "kcal": "energy"}
_CANONICAL = {"kj": "kJ", "kcal": "kcal", "g": "g", "mg": "mg", "ug": "ug", "mcg": "ug"}


def normalise_unit(unit: str) -> str:
    """Canonical spelling (mcg and the micro sign both become ``ug``)."""
    cleaned = unit.strip().replace("µ", "u").replace("μ", "u")
    return _CANONICAL.get(cleaned.lower(), cleaned)


def convert_unit(value: Decimal, from_unit: str, to_unit: str) -> Decimal | None:
    """Convert ``value``; return None when the units are unknown or not convertible."""
    a, b = normalise_unit(from_unit).lower(), normalise_unit(to_unit).lower()
    if a == b:
        return value
    if a not in _TO_BASE or b not in _TO_BASE or _FAMILY[a] != _FAMILY[b]:
        return None
    return value * _TO_BASE[a] / _TO_BASE[b]
