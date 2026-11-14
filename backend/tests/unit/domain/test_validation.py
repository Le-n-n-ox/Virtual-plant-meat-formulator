from decimal import Decimal as D

from app.domain.types import IngredientData, Line, NutrientRow
from app.domain.validation import TOTAL_TOLERANCE, validate_formulation

ING = {
    "a": IngredientData(id="a", common_name="A"),
    "b": IngredientData(id="b", common_name="B"),
    "old": IngredientData(id="old", common_name="Old", status="retired"),
    "dry": IngredientData(id="dry", common_name="Dry", moisture_basis="dry"),
    "dryrow": IngredientData(
        id="dryrow",
        common_name="DryRow",
        nutrients={"protein": NutrientRow("protein", D("1"), "g", per_basis="per_100g_dry")},
    ),
}


def codes(res):
    return [i.code for i in res.issues]


def test_valid():
    res = validate_formulation([Line("a", D("60")), {"ingredient_id": "b", "percent": 40}], ING)
    assert res.valid and res.issues == []
    assert res.to_dict() == {"valid": True, "total_percent": 100.0, "issues": []}


def test_tolerance():
    assert TOTAL_TOLERANCE == D("0.01")
    assert validate_formulation([Line("a", D("99.99")), Line("b", D("0.01"))], ING).valid
    res = validate_formulation([Line("a", D("60")), Line("b", D("39.98"))], ING)
    assert codes(res) == ["total_not_100"]


def test_total_not_100_message_and_dict():
    res = validate_formulation(
        [{"ingredient_id": "a", "percent": 60}, {"ingredient_id": "b", "percent": "38.5"}], ING
    )
    assert res.total_percent == D("98.5")
    assert res.to_dict() == {
        "valid": False,
        "total_percent": 98.5,
        "issues": [{"code": "total_not_100", "message": "Percentages total 98.5, expected 100."}],
    }


def test_empty_lines():
    res = validate_formulation([], ING)
    assert codes(res) == ["total_not_100"]
    assert "total 0," in res.issues[0].message


def test_percent_out_of_range():
    res = validate_formulation([Line("a", D("0")), Line("b", D("100"))], ING)
    assert codes(res) == ["percent_out_of_range"]
    assert res.issues[0].ingredient_id == "a"
    res = validate_formulation([{"ingredient_id": "a", "percent": "abc"}, Line("b", D("100"))], ING)
    assert codes(res) == ["percent_out_of_range"]
    res = validate_formulation([Line("a", D("150"))], ING)
    assert "percent_out_of_range" in codes(res)


def test_duplicate():
    res = validate_formulation([Line("a", D("50")), Line("a", D("50"))], ING)
    assert codes(res) == ["duplicate_ingredient"]
    assert res.issues[0].ingredient_id == "a"


def test_unknown():
    res = validate_formulation([Line("zzz", D("50")), Line("a", D("50"))], ING)
    assert codes(res) == ["unknown_ingredient"]
    assert res.issues[0].ingredient_id == "zzz"


def test_retired_only_for_new_versions():
    lines = [Line("old", D("50")), Line("a", D("50"))]
    assert codes(validate_formulation(lines, ING)) == ["ingredient_retired"]
    assert validate_formulation(lines, ING, new_version=False).valid


def test_bound_violation():
    lines = [Line("a", D("100"))]
    targets = {
        "protein": {"min": 30, "max": 20},
        "fat": 5,
        "fibre": {"min": 1},
        "ash_min": 4,
        "ash_max": 3,
        "water_min": 1,
        "water_max": 2,
    }
    res = validate_formulation(lines, ING, targets)
    assert codes(res) == ["bound_violation", "bound_violation"]
    assert {i.details["target"] for i in res.issues} == {"protein", "ash"}
    assert validate_formulation(lines, ING, {"protein": {"min": 20, "max": 30}}).valid


def test_basis_mismatch():
    res = validate_formulation([Line("dry", D("50")), Line("dryrow", D("50"))], ING)
    assert codes(res) == ["unit_or_basis_mismatch"] * 2
    assert [i.ingredient_id for i in res.issues] == ["dry", "dryrow"]
    assert res.issues[1].to_dict()["details"] == {"nutrients": ["protein"]}


def test_issue_order_lines_then_global():
    res = validate_formulation(
        [Line("zzz", D("10")), Line("a", D("10"))], ING, {"p": {"min": 2, "max": 1}}
    )
    assert codes(res) == ["unknown_ingredient", "total_not_100", "bound_violation"]
