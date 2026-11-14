"""Shared plain data types for the pure domain layer (no web, DB or worker imports).

Repositories convert ORM rows into these types; domain functions only see these.
"""

from dataclasses import dataclass, field
from decimal import Decimal

# Canonical nutrient keys (values per 100 g of the ingredient as used, unless basis says dry).
PROXIMATE_KEYS = ("water", "protein", "fat", "carbohydrate_available", "fibre", "ash")
ENERGY_KEYS = ("energy_kj", "energy_kcal")
# Indispensable amino acids, stored as mg per 100 g as-is.
AMINO_ACID_KEYS = (
    "histidine",
    "isoleucine",
    "leucine",
    "lysine",
    "methionine",
    "cysteine",
    "phenylalanine",
    "tyrosine",
    "threonine",
    "tryptophan",
    "valine",
)


@dataclass(frozen=True)
class NutrientRow:
    key: str
    value: Decimal | None  # None = not reported (never treat as zero)
    unit: str  # g | mg | ug | kJ | kcal
    flag: str = "analytical"  # analytical | estimated
    range_low: Decimal | None = None
    range_high: Decimal | None = None
    per_basis: str = "per_100g_as_is"  # per_100g_as_is | per_100g_dry


@dataclass(frozen=True)
class IngredientData:
    id: str
    common_name: str
    status: str = "active"  # active | draft | retired
    form: str = "raw"
    crop: str | None = None
    moisture_basis: str = "as_is"  # as_is | dry
    moisture_percent: Decimal | None = None
    nutrients: dict[str, NutrientRow] = field(default_factory=dict)
    functional_properties: dict[str, Decimal] = field(default_factory=dict)
    price_per_kg: Decimal | None = None
    price_currency: str | None = None
    dataset_version: str = "dev"
    license_status: str = "unknown"


@dataclass(frozen=True)
class Line:
    ingredient_id: str
    percent: Decimal


@dataclass(frozen=True)
class AminoAcidPattern:
    id: str
    name: str
    version: str
    # mg per g protein, keyed by amino acid or group key (e.g. "lysine",
    # "sulfur_amino_acids_methionine_cysteine")
    values: dict[str, Decimal]
    # group key -> member amino-acid keys, e.g. {"sulfur_amino_acids_methionine_cysteine":
    # ["methionine", "cysteine"]}
    groupings: dict[str, list[str]] = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessConditions:
    """Extrusion process block from job params (all optional at this level)."""

    moisture_percent: float | None = None
    temperature_profile_c: list[dict[str, float]] = field(default_factory=list)
    screw_speed_rpm: float | None = None
    feed_rate_kg_h: float | None = None
    cooling: dict[str, object] | None = None

    @property
    def max_barrel_temp_c(self) -> float | None:
        temps = [float(z["temp"]) for z in self.temperature_profile_c if "temp" in z]
        return max(temps) if temps else None
