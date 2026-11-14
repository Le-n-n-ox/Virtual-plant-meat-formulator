from decimal import Decimal

import pytest
from app.domain.optimization.constraints import (
    ConstraintSet,
    CostCeiling,
    IngredientBound,
    NutrientLimit,
    ParamsError,
    parse_constraints,
)
from app.domain.optimization.objectives import (
    Objective,
    is_linear,
    is_texture_target,
    parse_objectives,
)
from app.domain.optimization.solver import (
    InfeasibleError,
    MissingDataError,
    OptimizationCancelled,
    evaluate_lines,
    solve,
)
from app.domain.types import AminoAcidPattern, IngredientData, Line, NutrientRow


def ing(iid, protein, price, lysine=None, fat=1.0, extra=None):
    rows = {
        "protein": NutrientRow("protein", Decimal(str(protein)), "g"),
        "fat": NutrientRow("fat", Decimal(str(fat)), "g"),
    }
    if lysine is not None:
        rows["lysine"] = NutrientRow("lysine", Decimal(str(lysine)), "mg")
    for k, v in (extra or {}).items():
        rows[k] = NutrientRow(k, Decimal(str(v)), "mg")
    return IngredientData(
        id=iid,
        common_name=iid,
        nutrients=rows,
        price_per_kg=Decimal(str(price)),
        price_currency="KES",
    )


@pytest.fixture
def pool():
    items = [
        ing("a", 20, 100, lysine=2000),
        ing("b", 40, 300, lysine=1000),
        ing("c", 10, 50, lysine=200),
    ]
    return {i.id: i for i in items}


IDS = ["a", "b", "c"]


def total(c):
    return sum(ln.percent for ln in c.lines)


def pct(c):
    return {ln.ingredient_id: float(ln.percent) for ln in c.lines}


def mix(pool, c, key):
    return sum(
        float(ln.percent) * float(pool[ln.ingredient_id].nutrients[key].value) for ln in c.lines
    )


def test_lp_maximize_protein_golden(pool):
    cons = ConstraintSet(
        ingredient_bounds=[IngredientBound("a", 0, 50), IngredientBound("b", 0, 30)]
    )
    out = solve(pool, IDS, cons, [Objective("protein_g_per_100g", "maximize")])
    best = out.candidates[0]
    assert best.rank == 1
    assert pct(best) == {"a": 50.0, "b": 30.0, "c": 20.0}
    assert best.objective_values["protein_g_per_100g"] == pytest.approx(24.0)
    assert out.summary["method"] == "linprog_highs"
    for c in out.candidates:
        assert total(c) == Decimal("100.0")
        assert all(r["satisfied"] for r in c.constraint_report)
    vals = [c.objective_values["protein_g_per_100g"] for c in out.candidates]
    assert max(vals) == pytest.approx(24.0)
    keys = {tuple((ln.ingredient_id, ln.percent) for ln in c.lines) for c in out.candidates}
    assert len(keys) == len(out.candidates)


def test_cost_min_with_protein_minimum(pool):
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("protein", 25, "g", "min")])
    out = solve(pool, IDS, cons, [Objective("cost_per_kg", "minimize")])
    best = out.candidates[0]
    assert pct(best) == {"a": 75.0, "b": 25.0}
    assert best.objective_values["cost_per_kg"] == pytest.approx(150.0)
    for c in out.candidates:
        assert c.objective_values["cost_per_kg"] >= 150.0 - 1e-6
        assert mix(pool, c, "protein") / 100 >= 25 - 1e-4


def test_amino_acid_density_constraint(pool):
    pattern = AminoAcidPattern("p", "test", "1", {"lysine": Decimal("50")})
    cons = ConstraintSet(
        nutrient_limits=[
            NutrientLimit("lysine", 90, "mg_per_g_protein", "min"),
            NutrientLimit("protein", 15, "g", "min"),
        ]
    )
    out = solve(pool, IDS, cons, [Objective("cost_per_kg", "minimize")], amino_pattern=pattern)
    for c in out.candidates:
        assert mix(pool, c, "lysine") / mix(pool, c, "protein") >= 90 - 1e-3
    base_cons = ConstraintSet(nutrient_limits=[NutrientLimit("protein", 15, "g", "min")])
    base = solve(pool, IDS, base_cons, [Objective("cost_per_kg", "minimize")])
    base_cost = base.candidates[0].objective_values["cost_per_kg"]
    assert base_cost < out.candidates[0].objective_values["cost_per_kg"]


def test_infeasible_lists_constraint(pool):
    cons = ConstraintSet(
        nutrient_limits=[
            NutrientLimit("protein", 90, "g", "min"),
            NutrientLimit("fat", 0.5, "g", "min"),
        ]
    )
    with pytest.raises(InfeasibleError) as ei:
        solve(pool, IDS, cons, [Objective("cost_per_kg", "minimize")])
    names = [v["constraint"] for v in ei.value.violated]
    assert names == ["protein_min"]
    assert ei.value.violated[0]["achievable_slack"] == pytest.approx(50.0, abs=1e-4)
    assert "protein" in ei.value.explanation


def test_infeasible_bounds(pool):
    cons = ConstraintSet(
        ingredient_bounds=[IngredientBound("a", 70, 100), IngredientBound("b", 50, 100)]
    )
    with pytest.raises(InfeasibleError) as ei:
        solve(pool, IDS, cons, [Objective("cost_per_kg", "minimize")])
    assert ei.value.violated


def test_excluded_stays_zero(pool):
    cons = ConstraintSet(excluded_ingredient_ids={"b"})
    out = solve(pool, IDS, cons, [Objective("protein_g_per_100g", "maximize")])
    for c in out.candidates:
        assert "b" not in pct(c)
    assert pct(out.candidates[0]) == {"a": 100.0}


def test_cost_ceiling(pool):
    cons = ConstraintSet(cost_ceiling=CostCeiling(120, "KES"))
    out = solve(pool, IDS, cons, [Objective("protein_g_per_100g", "maximize")])
    for c in out.candidates:
        rep = {r["constraint"]: r for r in c.constraint_report}
        assert rep["cost_ceiling"]["satisfied"]
        assert rep["cost_ceiling"]["value"] <= 120 + 1e-4


def test_determinism(pool):
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("protein", 18, "g", "min")])
    objs = [Objective("protein_g_per_100g", "maximize"), Objective("cost_per_kg", "minimize")]
    r1 = solve(pool, IDS, cons, objs, seed=7)
    r2 = solve(pool, IDS, cons, objs, seed=7)
    assert [c.lines for c in r1.candidates] == [c.lines for c in r2.candidates]
    s1 = solve(pool, IDS, cons, [objs[0]], seed=3)
    s2 = solve(pool, IDS, cons, [objs[0]], seed=3)
    assert [c.lines for c in s1.candidates] == [c.lines for c in s2.candidates]


def test_multi_objective_pareto(pool):
    objs = [Objective("protein_g_per_100g", "maximize"), Objective("cost_per_kg", "minimize")]
    out = solve(pool, IDS, ConstraintSet(), objs, n_candidates=6)
    assert out.summary["method"] == "weighted_sum_lp"
    par = [c for c in out.candidates if c.pareto]
    assert len(par) >= 2
    assert out.summary["n_pareto"] == len(par)
    for c in par:
        p1 = c.objective_values["protein_g_per_100g"]
        k1 = c.objective_values["cost_per_kg"]
        for d in out.candidates:
            if d is c:
                continue
            p2 = d.objective_values["protein_g_per_100g"]
            k2 = d.objective_values["cost_per_kg"]
            assert not (p2 >= p1 and k2 <= k1 and (p2 > p1 or k2 < k1))
    assert [c.rank for c in out.candidates] == list(range(1, len(out.candidates) + 1))
    assert all(c.pareto for c in out.candidates[: len(par)])


def test_texture_blackbox_target(pool):
    pred = {"hardness": lambda d: 2 * d["a"] + 0.5 * d["b"]}
    emitted = []
    objs = [Objective("hardness", "target", value=60.0, unit="N")]
    out = solve(
        pool,
        IDS,
        ConstraintSet(),
        objs,
        texture_predictors=pred,
        n_starts=6,
        seed=1,
        candidate_cb=emitted.append,
    )
    assert out.summary["method"] == "slsqp_multistart"
    assert out.summary["n_starts"] == 6
    best = out.candidates[0]
    assert abs(best.objective_values["hardness"] - 60.0) < 0.5
    assert total(best) == Decimal("100.0")
    assert emitted
    again = solve(pool, IDS, ConstraintSet(), objs, texture_predictors=pred, n_starts=6, seed=1)
    assert [c.lines for c in again.candidates] == [c.lines for c in out.candidates]


def test_texture_with_nutrient_constraint(pool):
    pred = {"hardness": lambda d: d["a"] * 0.3 + d["c"] * 0.1}
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("protein", 22, "g", "min")])
    objs = [Objective("hardness", "minimize"), Objective("cost_per_kg", "minimize")]
    out = solve(pool, IDS, cons, objs, texture_predictors=pred, n_starts=5)
    assert out.candidates
    for c in out.candidates:
        assert all(r["satisfied"] for r in c.constraint_report)


def test_progress_and_cancel(pool):
    pred = {"hardness": lambda d: d["a"]}
    objs = [Objective("hardness", "maximize")]
    calls = []
    solve(
        pool,
        IDS,
        ConstraintSet(),
        objs,
        texture_predictors=pred,
        n_starts=4,
        progress_cb=lambda k, n: calls.append((k, n)),
    )
    assert calls == [(1, 4), (2, 4), (3, 4), (4, 4)]

    seen = []
    state = {"n": 0}

    def cancel():
        state["n"] += 1
        return state["n"] > 1

    with pytest.raises(OptimizationCancelled):
        solve(
            pool,
            IDS,
            ConstraintSet(),
            objs,
            texture_predictors=pred,
            n_starts=5,
            cancel_cb=cancel,
            progress_cb=lambda k, n: seen.append(k),
        )
    assert seen == [1]


def test_predictor_none_fails_start(pool):
    out = solve(
        pool,
        IDS,
        ConstraintSet(),
        [Objective("hardness", "maximize")],
        texture_predictors={"hardness": lambda d: None if d["b"] > 50 else d["a"]},
        n_starts=5,
    )
    assert out.candidates


def test_amino_acid_score_objective(pool):
    pattern = AminoAcidPattern("p", "t", "1", {"lysine": Decimal("50")})
    out = solve(
        pool,
        IDS,
        ConstraintSet(),
        [Objective("amino_acid_score", "maximize")],
        amino_pattern=pattern,
        n_starts=4,
    )
    # pure "a" has 100 mg lysine per g protein -> score 2.0
    assert out.candidates[0].objective_values["amino_acid_score"] == pytest.approx(2.0, abs=0.05)


def test_missing_data():
    pool = {"a": ing("a", 20, 100, extra={"zinc": 3}), "b": ing("b", 40, 300)}
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("zinc", 1, "mg", "min")])
    objs = [Objective("cost_per_kg", "minimize")]
    with pytest.raises(MissingDataError) as ei:
        solve(pool, ["a", "b"], cons, objs)
    assert ei.value.key == "zinc"
    assert ei.value.ingredient_ids == ["b"]
    cons.excluded_ingredient_ids = {"b"}  # fixed at 0: does not matter
    out = solve(pool, ["a", "b"], cons, objs)
    assert pct(out.candidates[0]) == {"a": 100.0}


def test_missing_price():
    b = ing("b", 40, 300)
    pool = {
        "a": ing("a", 20, 100),
        "b": IngredientData(id="b", common_name="b", nutrients=b.nutrients),
    }
    with pytest.raises(MissingDataError) as ei:
        solve(pool, ["a", "b"], ConstraintSet(), [Objective("cost_per_kg", "minimize")])
    assert ei.value.key == "price"


def test_dry_basis_and_units():
    dry = IngredientData(
        id="d",
        common_name="d",
        moisture_percent=Decimal("50"),
        nutrients={
            "protein": NutrientRow("protein", Decimal("40"), "g", per_basis="per_100g_dry"),
            "iron": NutrientRow("iron", Decimal("2000"), "ug"),
        },
    )
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("iron", 2, "mg", "min")])
    out = solve({"d": dry}, ["d"], cons, [Objective("protein_g_per_100g", "maximize")])
    cand = out.candidates[0]
    assert cand.objective_values["protein_g_per_100g"] == pytest.approx(20.0)
    assert cand.constraint_report[0]["value"] == pytest.approx(2.0)


def test_evaluate_lines(pool):
    cons = ConstraintSet(nutrient_limits=[NutrientLimit("protein", 30, "g", "min")])
    res = evaluate_lines(
        [Line("a", Decimal("50")), Line("b", Decimal("50"))],
        pool,
        cons,
        [Objective("protein_g_per_100g", "maximize")],
    )
    assert res["objective_values"]["protein_g_per_100g"] == pytest.approx(30.0)
    assert res["feasible"]


def test_parse_constraints_and_objectives():
    cs = parse_constraints(
        {
            "ingredient_bounds": [{"ingredient_id": "a", "min_percent": 5, "max_percent": 40}],
            "excluded_ingredient_ids": ["z"],
            "nutrient_minimums": [{"key": "lysine", "min": 50, "unit": "mg_per_g_protein"}],
            "nutrient_maximums": [{"key": "fat", "max": 10, "unit": "g_per_100g"}],
            "cost_ceiling": {"value": 450, "currency": "KES", "per": "kg"},
        }
    )
    assert cs.nutrient_limits[1].unit == "g"
    assert cs.nutrient_limits[1].kind == "max"
    assert cs.cost_ceiling.value == 450
    assert cs.excluded_ingredient_ids == {"z"}
    assert parse_constraints(None) == ConstraintSet()
    bad = {"ingredient_bounds": [{"ingredient_id": "a", "min_percent": 50, "max_percent": 10}]}
    with pytest.raises(ParamsError) as ei:
        parse_constraints(bad)
    assert ei.value.issues[0]["code"] == "invalid_bounds"
    objs = parse_objectives(
        [
            {"target": "protein_g_per_100g", "direction": "maximize"},
            {"target": "hardness", "direction": "target", "value": 45, "unit": "N"},
        ]
    )
    assert is_linear(objs[0])
    assert not is_linear(objs[1])
    assert is_texture_target("hardness")
    assert not is_texture_target("lysine_mg_per_100g")
    with pytest.raises(ParamsError):
        parse_objectives([{"target": "hardness", "direction": "target"}])
