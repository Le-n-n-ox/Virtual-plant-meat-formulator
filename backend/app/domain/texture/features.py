"""Texture model feature construction.

The default feature set is the composition-only high-moisture-extrusion baseline trained
on the FoodML 2023 table. Feature names match the training columns:

==================  =====================================  ==============================
feature             formulation / catalogue source         unit
==================  =====================================  ==============================
protein             protein                                g per 100 g of the dry blend
moisture            water                                  g per 100 g as formulated
ash                 ash                                    g per 100 g as formulated
carbs               carbohydrate_available                 g per 100 g as formulated
fat                 fat                                    g per 100 g as formulated
fiber               fibre                                  g per 100 g as formulated
target_moisture     process.moisture_percent               % feed moisture during extrusion
==================  =====================================  ==============================

Missing inputs are never imputed: the builder reports them and the caller declines to
predict.
"""

import math
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

import numpy as np

from app.domain.types import ProcessConditions

COMPOSITION_FEATURES = ["protein", "moisture", "ash", "carbs", "fat", "fiber", "target_moisture"]

# catalogue nutrient key -> feature name (feature names map to themselves, so callers may
# pass either vocabulary)
_KEY_TO_FEATURE = {
    "protein": "protein",
    "water": "moisture",
    "moisture": "moisture",
    "ash": "ash",
    "carbohydrate_available": "carbs",
    "carbs": "carbs",
    "fat": "fat",
    "fibre": "fiber",
    "fiber": "fiber",
}

FEATURE_SCHEMA_VERSION = "composition-v1"

FEATURE_UNITS = {
    "protein": "g/100 g",
    "moisture": "g/100 g",
    "ash": "g/100 g",
    "carbs": "g/100 g",
    "fat": "g/100 g",
    "fiber": "g/100 g",
    "target_moisture": "%",
}


def default_feature_schema() -> dict[str, Any]:
    return {
        "version": FEATURE_SCHEMA_VERSION,
        "features": list(COMPOSITION_FEATURES),
        "units": dict(FEATURE_UNITS),
        "imputation": "none",
    }


def _num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = float(value)
    try:
        number = float(value)
    except TypeError, ValueError:
        return None
    return number if math.isfinite(number) else None


def composition_from_blend(blend: Mapping[str, Decimal | float | None]) -> dict[str, float | None]:
    """Map catalogue nutrient keys (g/100 g of the blend) to feature names.

    Feature names are accepted as-is. Absent or non-finite values become ``None``
    (never zero). ``target_moisture`` comes from the process block, not the blend.
    """
    result: dict[str, float | None] = {
        f: None for f in COMPOSITION_FEATURES if f != "target_moisture"
    }
    for key, value in blend.items():
        feature = _KEY_TO_FEATURE.get(key)
        if feature is not None:
            result[feature] = _num(value)
    return result


def _process_value(name: str, process: ProcessConditions) -> float | None:
    if name == "target_moisture":
        return _num(process.moisture_percent)
    if name == "screw_speed_rpm":
        return _num(process.screw_speed_rpm)
    if name == "feed_rate_kg_h":
        return _num(process.feed_rate_kg_h)
    if name == "max_barrel_temp_c":
        return _num(process.max_barrel_temp_c)
    return None


def build_feature_vector(
    composition: Mapping[str, float | None],
    process: ProcessConditions,
    feature_schema: Mapping[str, Any],
) -> tuple[np.ndarray, list[str]]:
    """Return ``(1xN array, missing_feature_names)`` in the schema's feature order.

    Missing values are NaN in the array and listed in the second element; the caller must
    not predict when the list is non-empty.
    """
    names = list(feature_schema["features"])
    values: list[float] = []
    missing: list[str] = []
    for name in names:
        value = _process_value(name, process)
        if value is None and name in composition:
            value = _num(composition[name])
        if value is None:
            missing.append(name)
            values.append(float("nan"))
        else:
            values.append(value)
    return np.array([values], dtype=float), missing
