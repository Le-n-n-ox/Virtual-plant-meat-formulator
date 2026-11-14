from decimal import Decimal as D

import pytest
from app.domain.moisture import BasisError, as_is_to_dry, dry_to_as_is, normalize_row
from app.domain.types import IngredientData, NutrientRow
from app.domain.units import UnitError, canonical_unit, convert


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("mcg", "ug"),
        ("µg", "ug"),
        ("μg", "ug"),
        ("UG", "ug"),
        ("G", "g"),
        ("MG", "mg"),
        ("KJ", "kJ"),
        ("kcal", "kcal"),
    ],
)
def test_canonical_unit(raw, expected):
    assert canonical_unit(raw) == expected


def test_canonical_unit_unknown():
    with pytest.raises(UnitError):
        canonical_unit("oz")


def test_convert_mass():
    assert convert(D("2"), "g", "mg") == D("2000")
    assert convert(D("500"), "mg", "g") == D("0.5")
    assert convert(D("1500"), "mcg", "mg") == D("1.5")
    assert convert(D("1"), "g", "ug") == D("1000000")
    assert convert(D("3"), "mg", "mg") == D("3")


def test_convert_energy():
    assert convert(D("100"), "kcal", "kJ") == D("418.4")
    assert convert(D("418.4"), "kJ", "kcal") == D("100")


def test_convert_incompatible():
    with pytest.raises(UnitError):
        convert(D("1"), "g", "kJ")
    with pytest.raises(UnitError):
        convert(D("1"), "kcal", "mg")


def test_dry_as_is_roundtrip():
    # 40 g/100 g dry at 10 % moisture -> 40 * 0.9 = 36
    assert dry_to_as_is(D("40"), D("10")) == D("36")
    assert as_is_to_dry(D("36"), D("10")) == D("40")
    with pytest.raises(BasisError):
        as_is_to_dry(D("1"), D("100"))


def _ing(moisture=None):
    return IngredientData(id="i", common_name="x", moisture_percent=moisture)


def test_normalize_dry_row_with_range_and_unit():
    row = NutrientRow("iron", D("10"), "mg", "estimated", D("8"), D("12"), "per_100g_dry")
    out = normalize_row(row, _ing(D("20")), "ug")
    # 10 mg dry * 0.8 = 8 mg = 8000 ug; range 6.4..9.6 mg
    assert (out.value, out.range_low, out.range_high) == (D("8000"), D("6400"), D("9600"))
    assert out.unit == "ug"
    assert out.per_basis == "per_100g_as_is"
    assert out.flag == "estimated"


def test_normalize_as_is_default_unit_and_none():
    row = NutrientRow("protein", None, "G")
    out = normalize_row(row, _ing())
    assert out.value is None
    assert out.unit == "g"


def test_normalize_dry_without_moisture_raises():
    row = NutrientRow("protein", D("10"), "g", per_basis="per_100g_dry")
    with pytest.raises(BasisError):
        normalize_row(row, _ing())


def test_normalize_unit_error_propagates():
    with pytest.raises(UnitError):
        normalize_row(NutrientRow("protein", D("1"), "g"), _ing(), "kJ")
