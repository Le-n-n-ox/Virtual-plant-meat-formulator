"""End to end: train on literature HME data, approve, predict texture, optimize on hardness.

Out-of-domain blends get NO number (only nearest published evidence); in-domain blends get
a value with an interval. The optimizer only searches inside the models' training range.
"""

import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from app.config import get_settings
from app.db.models import (
    AminoAcidReferencePattern,
    Formulation,
    FormulationVersion,
    Ingredient,
    IngredientNutrient,
)
from app.mlops import datasets, registry, training
from sqlalchemy import select

# Raw-material compositions published with the FoodML dataset (inside the training range).
ISOLATES = {
    "ing_ypi": (
        "Pea isolate (test)",
        {
            "protein": 79,
            "water": 6,
            "ash": 4,
            "carbohydrate_available": 9.2,
            "fat": 0.2,
            "fibre": 1.6,
        },
    ),
    "ing_fbc": (
        "Faba concentrate (test)",
        {"protein": 56, "water": 9, "ash": 6, "carbohydrate_available": 15, "fat": 3, "fibre": 10},
    ),
}


@pytest.fixture()
def approved_hardness(db, users, tmp_path):  # type: ignore[no-untyped-def]
    settings = get_settings()
    try:
        dataset = datasets.load_hme_dataset(settings.data_dir)
    except FileNotFoundError:
        pytest.skip("literature dataset not present")
    outcome = training.train_target(
        "hardness", dataset, seed=1, min_training_samples=settings.min_training_samples
    )
    row = registry.register_outcome(
        db,
        outcome,
        target="hardness",
        dataset_version=dataset.dataset_version,
        artifact_dir=str(tmp_path),
        training_sources=dataset.sources,
    )
    db.commit()
    registry.approve_model(db, row.id, "usr_admin")
    db.commit()
    return row


def _formulation(db, fid, lines):  # type: ignore[no-untyped-def]
    db.add(Formulation(id=fid, owner_id="usr_scientist", name=fid, current_version=1))
    db.flush()
    db.add(
        FormulationVersion(
            formulation_id=fid,
            version=1,
            name=fid,
            lines=[{"ingredient_id": i, "percent": str(p)} for i, p in lines],
            targets=None,
            content_hash="h",
            created_by="usr_scientist",
        )
    )


@pytest.fixture()
def blends(db, users, catalog):  # type: ignore[no-untyped-def]
    """frm_out: whole-food flours (outside the model range); frm_in: isolate blend (inside)."""
    db.add(
        AminoAcidReferencePattern(
            id="aap_test",
            name="test",
            version="1",
            values={"lysine": 48},
            groupings={},
            is_default=True,
        )
    )
    for ing_id, (name, values) in ISOLATES.items():
        ing = Ingredient(
            id=ing_id,
            common_name=name,
            form="isolate",
            source_id="src_test",
            moisture_percent=Decimal(str(values["water"])),
            dataset_version="test.1",
        )
        for key, value in values.items():
            ing.nutrients.append(
                IngredientNutrient(nutrient_key=key, value=Decimal(str(value)), unit="g")
            )
        db.add(ing)
    db.flush()
    _formulation(db, "frm_out", [("ing_bean", 80), ("ing_sorghum", 20)])
    _formulation(db, "frm_in", [("ing_ypi", 60), ("ing_fbc", 40)])
    db.commit()


def _run(client, headers, fid, params, job_type="texture_prediction"):  # type: ignore[no-untyped-def]
    resp = client.post(
        f"/api/formulations/{fid}/jobs",
        json={"type": job_type, "params": params},
        headers=headers["scientist"],
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    return job_id, client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()


def _result(client, headers, job_id):  # type: ignore[no-untyped-def]
    return client.get(f"/api/jobs/{job_id}/result", headers=headers["scientist"]).json()


def test_models_endpoint_lists_approved(client, headers, approved_hardness):  # type: ignore[no-untyped-def]
    items = client.get("/api/models", headers=headers["viewer"]).json()["items"]
    assert [m["id"] for m in items] == [approved_hardness.id]
    detail = client.get(f"/api/models/{approved_hardness.id}", headers=headers["viewer"]).json()
    assert detail["limitations"] and detail["holdout_metrics"]


def test_in_domain_prediction_has_value_and_interval(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends
):
    job_id, status = _run(
        client, headers, "frm_in", {"process": {"moisture_percent": 62}, "targets": ["hardness"]}
    )
    assert status["status"] == "completed", status
    assert status["model_ids"] == [approved_hardness.id]
    result = _result(client, headers, job_id)
    pred = result["predictions"][0]
    assert pred["in_domain"] is True and pred["unit"] == "N"
    assert pred["interval"][0] <= pred["value"] <= pred["interval"][1]
    assert pred["interval_level"] == pytest.approx(0.9)
    assert pred["model"]["id"] == approved_hardness.id
    assert not any(w["code"] == "out_of_domain" for w in result["warnings"])


def test_out_of_domain_gives_no_number_only_nearest_evidence(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends, db, tmp_path
):
    from app.seed.catalog import seed_literature_experiments

    # Exercise the fresh-checkout path: CI does not have ignored processed imports.
    reference_dir = tmp_path / "data" / "reference"
    reference_dir.mkdir(parents=True)
    tracked_reference_dir = Path(__file__).resolve().parents[2] / "data" / "reference"
    for filename in (
        "foodml_texture_prediction_2023.csv",
        "foodml_ferawati_2021_crosswalk.csv",
    ):
        shutil.copyfile(tracked_reference_dir / filename, reference_dir / filename)
    seed_literature_experiments(db, tmp_path / "data")
    db.commit()
    job_id, status = _run(
        client, headers, "frm_out", {"process": {"moisture_percent": 60}, "targets": ["hardness"]}
    )
    assert status["status"] == "completed", status
    result = _result(client, headers, job_id)
    pred = result["predictions"][0]
    assert "value" not in pred and "interval" not in pred
    assert pred["in_domain"] is False and pred["reason"] == "out_of_domain"
    assert pred["domain"]["violations"]  # e.g. protein below the training range
    evidence = pred["nearest_evidence"]
    assert evidence and evidence[0]["n_samples"] > 0
    assert evidence[0]["measured_min"] <= evidence[0]["measured_max"]
    assert evidence[0]["unit"] == "N" and "doi.org" in evidence[0]["source"]
    assert any(w["code"] == "out_of_domain" for w in result["warnings"])


def test_texture_missing_inputs_not_predicted(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends, db
):
    row = db.execute(
        select(IngredientNutrient).where(
            IngredientNutrient.ingredient_id == "ing_sorghum",
            IngredientNutrient.nutrient_key == "fibre",
        )
    ).scalar_one()
    row.value = None
    db.commit()
    job_id, _status = _run(
        client, headers, "frm_out", {"process": {"moisture_percent": 60}, "targets": ["hardness"]}
    )
    pred = _result(client, headers, job_id)["predictions"][0]
    assert pred.get("value") is None and pred.get("reason") == "missing_features"


def test_optimization_with_texture_target_stays_in_domain(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends
):
    job_id, status = _run(
        client,
        headers,
        "frm_in",
        {
            "objectives": [
                {"target": "hardness", "direction": "target", "value": 40, "unit": "N"},
                {"target": "protein_g_per_100g", "direction": "maximize"},
            ],
            "constraints": {
                "ingredient_bounds": [
                    {"ingredient_id": "ing_ypi", "min_percent": 20, "max_percent": 90}
                ]
            },
            "process": {"moisture_percent": 62},
            "n_candidates": 3,
            "n_starts": 4,
            "seed": 3,
        },
        job_type="optimization",
    )
    assert status["status"] == "completed", status
    cands = client.get(
        f"/api/formulations/frm_in/candidates?job_id={job_id}", headers=headers["scientist"]
    ).json()["items"]
    assert cands
    for cand in cands:
        assert sum(line["percent"] for line in cand["lines"]) == pytest.approx(100.0, abs=1e-9)
        pred = cand["predictions"][0]
        assert pred["target"] == "hardness" and pred["in_domain"] is True and "value" in pred
        ypi = next((ln["percent"] for ln in cand["lines"] if ln["ingredient_id"] == "ing_ypi"), 0)
        assert 20 - 1e-9 <= ypi <= 90 + 1e-9
        assert 56 - 0.05 <= cand["metrics"]["protein_g_per_100g"] <= 88 + 0.05


def test_optimization_texture_target_out_of_range_ingredients_is_infeasible(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends
):
    _job_id, status = _run(
        client,
        headers,
        "frm_out",
        {
            "objectives": [{"target": "hardness", "direction": "target", "value": 40}],
            "process": {"moisture_percent": 60},
            "n_starts": 3,
            "seed": 1,
        },
        job_type="optimization",
    )
    assert status["status"] == "failed"
    assert status["error"]["code"] == "infeasible"
    assert "protein isolate or concentrate" in status["error"]["message"]
    assert status["candidate_ids"] == []


def test_optimization_texture_moisture_outside_range_rejected(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends
):
    _job_id, status = _run(
        client,
        headers,
        "frm_in",
        {
            "objectives": [{"target": "hardness", "direction": "target", "value": 40}],
            "process": {"moisture_percent": 30},
            "seed": 1,
        },
        job_type="optimization",
    )
    assert status["status"] == "failed" and status["error"]["code"] == "validation_failed"
    assert "moisture" in status["error"]["message"].lower()


def test_optimization_texture_objective_missing_inputs_fails_cleanly(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, blends, db
):
    row = db.execute(
        select(IngredientNutrient).where(
            IngredientNutrient.ingredient_id == "ing_fbc",
            IngredientNutrient.nutrient_key == "fibre",
        )
    ).scalar_one()
    row.value = None
    db.commit()
    _job_id, status = _run(
        client,
        headers,
        "frm_in",
        {
            "objectives": [{"target": "hardness", "direction": "target", "value": 40}],
            "process": {"moisture_percent": 62},
            "n_starts": 3,
            "seed": 1,
        },
        job_type="optimization",
    )
    assert status["status"] == "failed"
    assert status["error"]["code"] == "missing_ingredient_data"
    assert status["error"]["details"]["ingredient_ids"] == ["ing_fbc"]
    assert status["candidate_ids"] == []


def test_training_job_via_admin(client, headers, db, users):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/admin/models/train",
        json={"target": "chewiness", "seed": 5},
        headers=headers["admin"],
    )
    assert resp.status_code == 202
    status = client.get(f"/api/jobs/{resp.json()['job_id']}", headers=headers["admin"]).json()
    if status["status"] == "failed" and status["error"]["code"] == "missing_ingredient_data":
        pytest.skip("dataset not present")
    assert status["status"] == "completed", status
    assert status["model_ids"]
    assert (
        client.post(
            "/api/admin/models/train", json={"target": "chewiness"}, headers=headers["scientist"]
        ).status_code
        == 403
    )
