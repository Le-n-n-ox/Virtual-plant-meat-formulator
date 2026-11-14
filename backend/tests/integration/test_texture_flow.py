"""End to end: train on literature HME data, approve, predict texture, optimize on hardness."""

import pytest
from app.config import get_settings
from app.db.models import (
    AminoAcidReferencePattern,
    Formulation,
    FormulationVersion,
    IngredientNutrient,
)
from app.mlops import datasets, registry, training
from sqlalchemy import select


@pytest.fixture()
def approved_hardness(db, users, tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
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


@pytest.fixture()
def protein_rich(db, users, catalog):  # type: ignore[no-untyped-def]
    """Formulation whose composition resembles the literature isolates (in domain-ish)."""
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
    db.add(Formulation(id="frm_tex", owner_id="usr_scientist", name="Tex", current_version=1))
    db.flush()
    db.add(
        FormulationVersion(
            formulation_id="frm_tex",
            version=1,
            name="Tex",
            lines=[
                {"ingredient_id": "ing_bean", "percent": "80"},
                {"ingredient_id": "ing_sorghum", "percent": "20"},
            ],
            targets=None,
            content_hash="h",
            created_by="usr_scientist",
        )
    )
    db.commit()


def test_models_endpoint_lists_approved(client, headers, approved_hardness):  # type: ignore[no-untyped-def]
    items = client.get("/api/models", headers=headers["viewer"]).json()["items"]
    assert [m["id"] for m in items] == [approved_hardness.id]
    detail = client.get(f"/api/models/{approved_hardness.id}", headers=headers["viewer"]).json()
    assert detail["limitations"] and detail["holdout_metrics"]


def test_texture_job_returns_interval_and_domain(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, protein_rich, db
):
    resp = client.post(
        "/api/formulations/frm_tex/jobs",
        json={
            "type": "texture_prediction",
            "params": {
                "process": {"moisture_percent": 60, "screw_speed_rpm": 250},
                "targets": ["hardness"],
            },
        },
        headers=headers["scientist"],
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
    assert status["status"] == "completed", status
    assert status["model_ids"] == [approved_hardness.id]
    result = client.get(f"/api/jobs/{job_id}/result", headers=headers["scientist"]).json()
    pred = result["predictions"][0]
    assert pred["target"] == "hardness" and pred["unit"] == "N"
    assert pred["interval"][0] <= pred["value"] <= pred["interval"][1]
    assert pred["interval_level"] == pytest.approx(0.9)
    assert pred["model"]["id"] == approved_hardness.id
    assert isinstance(pred["in_domain"], bool)
    if not pred["in_domain"]:
        events = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
        assert events  # out_of_domain warning raised (checked below via result warnings)
        assert any(w["code"] == "out_of_domain" for w in result["warnings"])


def test_texture_missing_inputs_not_predicted(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, protein_rich, db
):
    row = db.execute(
        select(IngredientNutrient).where(
            IngredientNutrient.ingredient_id == "ing_sorghum",
            IngredientNutrient.nutrient_key == "fibre",
        )
    ).scalar_one()
    row.value = None
    db.commit()
    job_id = client.post(
        "/api/formulations/frm_tex/jobs",
        json={
            "type": "texture_prediction",
            "params": {"process": {"moisture_percent": 60}, "targets": ["hardness"]},
        },
        headers=headers["scientist"],
    ).json()["job_id"]
    result = client.get(f"/api/jobs/{job_id}/result", headers=headers["scientist"]).json()
    pred = result["predictions"][0]
    assert pred.get("value") is None and pred.get("reason") == "missing_features"


def test_optimization_with_texture_target(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, protein_rich, db
):
    resp = client.post(
        "/api/formulations/frm_tex/jobs",
        json={
            "type": "optimization",
            "params": {
                "objectives": [
                    {"target": "hardness", "direction": "target", "value": 40, "unit": "N"},
                    {"target": "protein_g_per_100g", "direction": "maximize"},
                ],
                "constraints": {
                    "ingredient_bounds": [
                        {"ingredient_id": "ing_bean", "min_percent": 20, "max_percent": 90}
                    ]
                },
                "process": {"moisture_percent": 60},
                "n_candidates": 3,
                "n_starts": 4,
                "seed": 3,
            },
        },
        headers=headers["scientist"],
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
    assert status["status"] == "completed", status
    cands = client.get(
        f"/api/formulations/frm_tex/candidates?job_id={job_id}", headers=headers["scientist"]
    ).json()["items"]
    assert cands
    for cand in cands:
        assert sum(line["percent"] for line in cand["lines"]) == pytest.approx(100.0, abs=1e-9)
        assert cand["predictions"] and cand["predictions"][0]["target"] == "hardness"
        bean = next((ln["percent"] for ln in cand["lines"] if ln["ingredient_id"] == "ing_bean"), 0)
        assert 20 - 1e-9 <= bean <= 90 + 1e-9
    progress = [
        e
        for e in client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()[
            "candidate_ids"
        ]
    ]
    assert progress


def test_training_job_via_admin(client, headers, db, users):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/admin/models/train", json={"target": "chewiness", "seed": 5}, headers=headers["admin"]
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


def test_optimization_texture_objective_missing_inputs_fails_cleanly(  # type: ignore[no-untyped-def]
    client, headers, approved_hardness, protein_rich, db
):
    row = db.execute(
        select(IngredientNutrient).where(
            IngredientNutrient.ingredient_id == "ing_sorghum",
            IngredientNutrient.nutrient_key == "fibre",
        )
    ).scalar_one()
    row.value = None
    db.commit()
    resp = client.post(
        "/api/formulations/frm_tex/jobs",
        json={
            "type": "optimization",
            "params": {
                "objectives": [{"target": "hardness", "direction": "target", "value": 40}],
                "process": {"moisture_percent": 60},
                "n_starts": 3,
                "seed": 1,
            },
        },
        headers=headers["scientist"],
    )
    status = client.get(f"/api/jobs/{resp.json()['job_id']}", headers=headers["scientist"]).json()
    assert status["status"] == "failed"
    assert status["error"]["code"] == "missing_ingredient_data"
    assert status["error"]["details"]["ingredient_ids"] == ["ing_sorghum"]
    assert status["candidate_ids"] == []
