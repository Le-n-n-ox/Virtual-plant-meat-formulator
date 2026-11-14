"""Unit canonicalisation and conversion (mass units and energy units)."""

from decimal import Decimal

_ALIASES = {
    "g": "g",
    "mg": "mg",
    "ug": "ug",
    "mcg": "ug",
    "µg": "ug",  # micro sign
    "μg": "ug",  # greek mu
    "kj": "kJ",
    "kcal": "kcal",
}
_MASS_IN_G = {"g": Decimal(1), "mg": Decimal("0.001"), "ug": Decimal("0.000001")}
KJ_PER_KCAL = Decimal("4.184")


class UnitError(ValueError):
    """Raised for unknown units or incompatible conversions."""


def canonical_unit(unit: str) -> str:
    """Return the canonical spelling of ``unit`` (case-insensitive)."""
    key = unit.strip().lower()
    try:
        return _ALIASES[key]
    except KeyError:
        raise UnitError(f"Unknown unit: {unit!r}") from None


def convert(value: Decimal, from_unit: str, to_unit: str) -> Decimal:
    """Convert ``value`` between units of the same dimension (mass or energy)."""
    src, dst = canonical_unit(from_unit), canonical_unit(to_unit)
    if src == dst:
        return value
    if src in _MASS_IN_G and dst in _MASS_IN_G:
        return value * _MASS_IN_G[src] / _MASS_IN_G[dst]
    if src == "kcal" and dst == "kJ":
        return value * KJ_PER_KCAL
    if src == "kJ" and dst == "kcal":
        return value / KJ_PER_KCAL
    raise UnitError(f"Cannot convert {src} to {dst}")
