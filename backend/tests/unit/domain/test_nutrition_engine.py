from decimal import Decimal as D

import pytest
from app.domain.moisture import BasisError
from app.domain.nutrition import (
    CALC_VERSION,
    blend_composition,
    calculate_nutrition,
    linear_coefficients,
)
from app.domain.types import IngredientData, Line, NutrientRow
from hypothesis import given
from hypothesis import strategies as st

EPS = D("1e-18")


def ing(id_, moisture=None, **rows):
    """rows: key=(value, unit[, flag[, low, high[, basis]]])."""
    nutrients = {}
    for key, spec in rows.items():
        value, unit, *rest = spec
        row = NutrientRow(key, None if value is None else D(str(value)), unit)
        if rest:
            flag, low, high, basis = (list(rest) + [None] * 4)[:4]
            row = NutrientRow(
                key,
                row.value,
                unit,
                flag or "analytical",
                None if low is None else D(str(low)),
                None if high is None else D(str(high)),
                basis or "per_100g_as_is",
            )
        nutrients[key] = row
    return IngredientData(
        id=id_,
        common_name=id_,
        moisture_percent=None if moisture is None else D(str(moisture)),
        nutrients=nutrients,
    )


def L(*pairs):
    return [Line(i, D(str(p))) for i, p in pairs]


def reg(*items):
    return {i.id: i for i in items}


def calc(lines, ingredients, **units):
    return calculate_nutrition(lines, ingredients, units)


def test_calc_version():
    assert CALC_VERSION == "nutrition-1.0.0"


# ---- golden cases (hand arithmetic in comments) ------------------------------------------


def test_golden_1_two_ingredient_protein():
    # 60 % soy (36 g) + 40 % maize (8 g): 0.6*36 + 0.4*8 = 21.6 + 3.2 = 24.8
    r = reg(ing("soy", protein=(36, "g")), ing("maize", protein=(8, "g")))
    assert calc(L(("soy", 60), ("maize", 40)), r, protein="g").get("protein").value == D("24.8")


def test_golden_2_three_ingredients_fat():
    # 50 % @ 2 + 30 % @ 10 + 20 % @ 100 = 1 + 3 + 20 = 24
    r = reg(ing("a", fat=(2, "g")), ing("b", fat=(10, "g")), ing("oil", fat=(100, "g")))
    assert calc(L(("a", 50), ("b", 30), ("oil", 20)), r, fat="g").get("fat").value == D("24")


def test_golden_3_unit_conversion_mg_to_g():
    # iron 5000 mg *0.5 = 2500 mg ; 2 g *0.5 = 1 g -> 2.5 g + 1 g = 3.5 g
    r = reg(ing("a", iron=(5000, "mg")), ing("b", iron=(2, "g")))
    assert calc(L(("a", 50), ("b", 50)), r, iron="g").get("iron").value == D("3.5")


def test_golden_4_micrograms():
    # B12: 2 ug *0.25 = 0.5 ug ; 0.004 mg = 4 ug *0.75 = 3 ug -> 3.5 ug
    r = reg(ing("a", b12=(2, "mcg")), ing("b", b12=(0.004, "mg")))
    res = calc(L(("a", 25), ("b", 75)), r, b12="ug").get("b12")
    assert (res.value, res.unit) == (D("3.5"), "ug")


def test_golden_5_dry_basis():
    # protein 50 g dry at 10 % moisture = 45 g as-is; 80 % of it = 36; + 20 % * 5 = 1 -> 37
    r = reg(
        ing("dry", moisture=10, protein=(50, "g", "analytical", None, None, "per_100g_dry")),
        ing("wet", protein=(5, "g")),
    )
    assert calc(L(("dry", 80), ("wet", 20)), r, protein="g").get("protein").value == D("37")


def test_golden_6_energy_reported_only():
    # kJ: 0.7*1500 + 0.3*400 = 1050 + 120 = 1170 ; kcal from kJ rows: 1170/4.184
    r = reg(ing("a", energy_kj=(1500, "kJ")), ing("b", energy_kj=(400, "kJ")))
    res = calc(L(("a", 70), ("b", 30)), r, energy_kj="kJ", energy_kcal="kcal")
    assert res.get("energy_kj").value == D("1170")
    # no kcal rows reported -> null, never derived (no Atwater, no kJ conversion of other keys)
    assert res.get("energy_kcal").value is None


def test_golden_7_energy_kcal_row_in_kj():
    # 100 kcal *0.5 = 418.4 kJ *0.5 = 209.2 ; 200 kJ *0.5 = 100 -> 309.2
    r = reg(ing("a", energy=(100, "kcal")), ing("b", energy=(200, "kJ")))
    assert calc(L(("a", 50), ("b", 50)), r, energy="kJ").get("energy").value == D("309.2")


def test_golden_8_water_added_zero_is_known():
    # 90 % flour (protein 10) + 10 % water (protein 0) = 9 + 0 = 9
    r = reg(ing("flour", protein=(10, "g")), ing("water", protein=(0, "g")))
    assert calc(L(("flour", 90), ("water", 10)), r, protein="g").get("protein").value == D("9")


def test_golden_9_range():
    # low: 0.5*18 + 0.5*8 = 13 ; high: 0.5*22 + 0.5*12 = 17 ; value 0.5*20+0.5*10 = 15
    r = reg(
        ing("a", protein=(20, "g", "analytical", 18, 22)),
        ing("b", protein=(10, "g", "analytical", 8, 12)),
    )
    res = calc(L(("a", 50), ("b", 50)), r, protein="g").get("protein")
    assert (res.value, res.range) == (D("15"), (D("13"), D("17")))
    assert res.contains_estimated is False


def test_golden_10_range_missing_on_one_ingredient():
    r = reg(ing("a", protein=(20, "g", "analytical", 18, 22)), ing("b", protein=(10, "g")))
    res = calc(L(("a", 50), ("b", 50)), r, protein="g").get("protein")
    assert res.value == D("15") and res.range is None


def test_golden_11_estimated_flag():
    # 0.5*4 + 0.5*6 = 5, one contributor estimated
    r = reg(ing("a", ash=(4, "g", "estimated")), ing("b", ash=(6, "g")))
    res = calc(L(("a", 50), ("b", 50)), r, ash="g").get("ash")
    assert res.value == D("5") and res.contains_estimated is True


def test_golden_12_zero_percent_line_ignored():
    r = reg(ing("a", protein=(10, "g")), ing("b"))
    res = calc(L(("a", 100), ("b", 0)), r, protein="g").get("protein")
    assert res.value == D("10") and res.missing_ingredient_ids == []


# ---- missing data -------------------------------------------------------------------------


def test_missing_row_and_none_value_give_null():
    r = reg(ing("a", protein=(10, "g")), ing("b", protein=(None, "g")), ing("c"))
    res = calc(L(("a", 50), ("b", 30), ("c", 20)), r, protein="g", fat="g")
    p = res.get("protein")
    assert p.value is None and p.reason == "missing_data" and p.missing_ingredient_ids == ["b", "c"]
    assert p.range is None
    assert res.get("fat").missing_ingredient_ids == ["a", "b", "c"]


def test_payload_shape():
    r = reg(
        ing("a", protein=(20, "g", "analytical", 18, 22)),
        ing("b", protein=(10, "g"), b12=(1, "ug")),
    )
    r["a"].nutrients.pop("b12", None)
    payload = calc(L(("a", 50), ("b", 50)), r, protein="g", b12="ug").to_payload()
    assert payload["basis"] == "per_100g_as_formulated"
    p, b12 = payload["nutrients"]
    # b has no range, so the range is omitted from the payload
    assert p == {
        "key": "protein",
        "value": 15.0,
        "unit": "g",
        "flag": "calculated",
        "contains_estimated": False,
        "missing_ingredient_ids": [],
    }
    assert b12 == {
        "key": "b12",
        "value": None,
        "unit": "ug",
        "flag": "calculated",
        "contains_estimated": False,
        "missing_ingredient_ids": ["a"],
        "reason": "missing_data",
    }


def test_basis_error_propagates():
    r = reg(ing("a", protein=(10, "g", "analytical", None, None, "per_100g_dry")))
    with pytest.raises(BasisError):
        calc(L(("a", 100)), r, protein="g")


def test_blend_composition_and_coefficients():
    r = reg(
        ing("a", protein=(10, "g"), fat=(2, "g")),
        ing("b", protein=(20, "g"), fat=(None, "g")),
    )
    out = blend_composition(L(("a", 50), ("b", 50)), r, ("protein", "fat"))
    assert out == {"protein": D("15"), "fat": None}
    assert linear_coefficients(r, ["a", "b", "zz"], "fat", "mg") == [D("2000"), None, None]


# ---- property tests -------------------------------------------------------------------------

R = reg(
    ing("a", protein=(31.5, "g"), lysine=(1200, "mg")),
    ing("b", protein=(8.25, "g"), lysine=(0.3, "g")),
    ing("c", protein=(0.5, "g"), lysine=(10, "mg")),
)
UNITS = {"protein": "g", "lysine": "mg"}


def _vals(lines):
    return {n.key: n.value for n in calculate_nutrition(lines, R, UNITS).nutrients}


@given(st.lists(st.integers(1, 1000), min_size=3, max_size=3), st.integers(1, 50))
def test_scaling_invariance(weights, k):
    def lines(ws):
        total = sum(ws)
        return [Line(i, D(100) * w / total) for i, w in zip("abc", ws, strict=True)]

    v1 = _vals(lines(weights))
    v2 = _vals(lines([w * k for w in weights]))
    for key in UNITS:
        assert abs(v1[key] - v2[key]) < D("1e-15")


@given(st.sampled_from("abc"))
def test_single_ingredient_reproduces_row(i):
    vals = _vals([Line(i, D(100))])
    assert vals["protein"] == R[i].nutrients["protein"].value
    row = R[i].nutrients["lysine"]
    assert vals["lysine"] == (row.value * 1000 if row.unit == "g" else row.value)


@given(st.integers(1, 99))
def test_additivity(p):
    mix = _vals([Line("a", D(p)), Line("b", D(100 - p))])
    va, vb = _vals([Line("a", D(100))]), _vals([Line("b", D(100))])
    for key in UNITS:
        expected = D(p) / 100 * va[key] + (100 - D(p)) / 100 * vb[key]
        assert abs(mix[key] - expected) < D("1e-15")
