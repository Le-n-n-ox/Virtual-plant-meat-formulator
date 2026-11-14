"""Job lifecycle, event integrity, SSE replay, stream tokens and cancellation."""

import time
from decimal import Decimal

import pytest
from app.core.ids import new_id
from app.db.models import (
    AminoAcidReferencePattern,
    Formulation,
    FormulationVersion,
    Job,
    JobEvent,
)
from app.db.session import SessionLocal
from app.jobs.events import EventAfterTerminalError, JobEmitter
from app.jobs.runner import get_bus
from sqlalchemy import select

FAO_ADULT = {
    "histidine": 16,
    "isoleucine": 30,
    "leucine": 61,
    "lysine": 48,
    "sulfur_amino_acids_methionine_cysteine": 23,
    "aromatic_amino_acids_phenylalanine_tyrosine": 41,
    "threonine": 25,
    "tryptophan": 6.6,
    "valine": 40,
}
GROUPS = {
    "sulfur_amino_acids_methionine_cysteine": ["methionine", "cysteine"],
    "aromatic_amino_acids_phenylalanine_tyrosine": ["phenylalanine", "tyrosine"],
}


@pytest.fixture()
def saved(db, users, catalog):  # type: ignore[no-untyped-def]
    db.add(
        AminoAcidReferencePattern(
            id="fao2013_older_child_adolescent_adult",
            name="FAO 2013 adult",
            version="2013",
            values=FAO_ADULT,
            groupings=GROUPS,
            is_default=True,
        )
    )
    frm = Formulation(id="frm_test", owner_id="usr_scientist", name="Test", current_version=1)
    db.add(frm)
    db.flush()
    db.add(
        FormulationVersion(
            formulation_id="frm_test",
            version=1,
            name="Test",
            lines=[
                {"ingredient_id": "ing_bean", "percent": "60"},
                {"ingredient_id": "ing_sorghum", "percent": "40"},
            ],
            targets=None,
            content_hash="x",
            created_by="usr_scientist",
        )
    )
    db.commit()
    return frm


def _events(db, job_id):  # type: ignore[no-untyped-def]
    db.expire_all()
    return list(
        db.execute(
            select(JobEvent).where(JobEvent.job_id == job_id).order_by(JobEvent.seq)
        ).scalars()
    )


def test_nutrition_job_end_to_end(client, headers, saved, db):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["scientist"]
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]

    status = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
    assert status["status"] == "completed", status
    assert status["result_available"] is True
    assert status["calc_version"] and status["data_versions"]

    events = _events(db, job_id)
    seqs = [e.seq for e in events]
    assert seqs == list(range(1, len(seqs) + 1))  # gapless
    assert events[-1].event == "job.completed"
    stages = [e.payload["stage"] for e in events if e.event == "stage.updated"]
    assert stages == [
        "validating",
        "loading_ingredients",
        "calculating",
        "scoring_amino_acids",
        "storing",
    ]
    assert all(e.payload["progress_percent"] is None for e in events)

    result = client.get(f"/api/jobs/{job_id}/result", headers=headers["scientist"]).json()
    protein = next(n for n in result["nutrients"] if n["key"] == "protein")
    assert protein["value"] == pytest.approx(0.6 * 22 + 0.4 * 10)
    b12 = next(n for n in result["nutrients"] if n["key"] == "vitamin_b12")
    assert b12["value"] is None and b12["reason"] == "missing_data"
    assert result["amino_acids"]["method"] == "AAS"
    assert "DIAAS" not in resp.text + str(result)

    nut = client.get("/api/formulations/frm_test/nutrition", headers=headers["scientist"])
    assert nut.status_code in (200, 404)  # route owned by results router


def test_sse_replay_and_last_event_id(client, headers, saved, db):  # type: ignore[no-untyped-def]
    job_id = client.post(
        "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["scientist"]
    ).json()["job_id"]
    token = client.post(f"/api/jobs/{job_id}/stream-token", headers=headers["scientist"]).json()[
        "token"
    ]
    with client.stream("GET", f"/api/jobs/{job_id}/events?token={token}") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        body = "".join(resp.iter_text())
    assert body.count("event: ") == len(_events(db, job_id))
    assert body.strip().splitlines()[-1].startswith("data:") and "job.completed" in body

    # Token is single use
    again = client.get(f"/api/jobs/{job_id}/events?token={token}")
    assert again.status_code == 401

    token2 = client.post(f"/api/jobs/{job_id}/stream-token", headers=headers["scientist"]).json()[
        "token"
    ]
    with client.stream(
        "GET", f"/api/jobs/{job_id}/events?token={token2}", headers={"Last-Event-ID": "3"}
    ) as resp:
        body2 = "".join(resp.iter_text())
    ids = [int(line[4:]) for line in body2.splitlines() if line.startswith("id: ")]
    assert ids[0] == 4 and ids == list(range(4, len(_events(db, job_id)) + 1))


def test_stream_token_bound_to_job_and_user(client, headers, saved, db):  # type: ignore[no-untyped-def]
    job_id = client.post(
        "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["scientist"]
    ).json()["job_id"]
    assert (
        client.post(f"/api/jobs/{job_id}/stream-token", headers=headers["other"]).status_code == 404
    )
    token = client.post(f"/api/jobs/{job_id}/stream-token", headers=headers["scientist"]).json()[
        "token"
    ]
    assert client.get(f"/api/jobs/job_other/events?token={token}").status_code == 401
    assert client.get(f"/api/jobs/{job_id}/events").status_code == 401


def test_roles_and_ownership(client, headers, saved):  # type: ignore[no-untyped-def]
    assert (
        client.post(
            "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["viewer"]
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["other"]
        ).status_code
        == 404
    )
    assert client.get("/api/jobs", headers=headers["viewer"]).status_code == 403


def test_idempotency_key_returns_original(client, headers, saved):  # type: ignore[no-untyped-def]
    h = {**headers["scientist"], "Idempotency-Key": "abc"}
    a = client.post("/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=h)
    b = client.post("/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=h)
    assert a.json()["job_id"] == b.json()["job_id"]
    listing = client.get("/api/jobs", headers=headers["scientist"]).json()
    assert listing["total"] == 1 and listing["items"][0]["duration_ms"] is not None


def test_cancel_rules(client, headers, saved, db):  # type: ignore[no-untyped-def]
    job_id = client.post(
        "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["scientist"]
    ).json()["job_id"]
    resp = client.post(f"/api/jobs/{job_id}/cancel", headers=headers["scientist"])
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "job_already_finished"

    job = Job(
        id=new_id("job"),
        formulation_id="frm_test",
        formulation_version=1,
        type="texture_prediction",
        status="running",
        params={},
        created_by="usr_scientist",
    )
    db.add(job)
    db.commit()
    resp = client.post(f"/api/jobs/{job.id}/cancel", headers=headers["scientist"])
    assert resp.json()["error"]["code"] == "cancel_not_supported"


def test_texture_without_approved_model(client, headers, saved):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/formulations/frm_test/jobs",
        json={
            "type": "texture_prediction",
            "params": {"process": {"moisture_percent": 60}, "targets": ["hardness"]},
        },
        headers=headers["scientist"],
    )
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "model_unavailable"
    missing = client.post(
        "/api/formulations/frm_test/jobs",
        json={"type": "texture_prediction", "params": {"targets": ["hardness"]}},
        headers=headers["scientist"],
    )
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "validation_failed"


def test_result_not_ready(client, headers, saved, db):  # type: ignore[no-untyped-def]
    job = Job(
        id=new_id("job"),
        formulation_id="frm_test",
        formulation_version=1,
        type="optimization",
        status="running",
        params={},
        created_by="usr_scientist",
    )
    db.add(job)
    db.commit()
    resp = client.get(f"/api/jobs/{job.id}/result", headers=headers["scientist"])
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "result_not_ready"


def test_emitter_rules(db, users, saved):  # type: ignore[no-untyped-def]
    job = Job(
        id=new_id("job"),
        formulation_id="frm_test",
        formulation_version=1,
        type="optimization",
        status="queued",
        params={},
        created_by="usr_scientist",
    )
    db.add(job)
    db.commit()
    emitter = JobEmitter(job.id, SessionLocal, get_bus())
    emitter.stage("searching")
    assert emitter.progress(1, 3)["progress_percent"] == 33
    assert emitter.progress(2, 3)["progress_percent"] == 66
    p = emitter.stage("ranking")
    assert p["progress_percent"] is None and p["status"] == "running"
    emitter.completed()
    with pytest.raises(EventAfterTerminalError):
        emitter.warning("late", "late")
    with pytest.raises(ValueError):
        JobEmitter(job.id, SessionLocal, get_bus())._append("bogus")


def test_optimization_job_streams_candidates(client, headers, saved, db):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/formulations/frm_test/jobs",
        json={
            "type": "optimization",
            "params": {
                "objectives": [{"target": "protein_g_per_100g", "direction": "maximize"}],
                "constraints": {
                    "ingredient_bounds": [
                        {"ingredient_id": "ing_bean", "min_percent": 10, "max_percent": 70},
                        {"ingredient_id": "ing_sorghum", "min_percent": 30, "max_percent": 90},
                    ]
                },
                "n_candidates": 3,
                "seed": 7,
            },
        },
        headers=headers["scientist"],
    )
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
    assert status["status"] == "completed", status
    assert status["seed"] == 7 and status["candidate_ids"]
    events = _events(db, job_id)
    assert any(e.event == "candidate.ready" for e in events)
    result = client.get(f"/api/jobs/{job_id}/result", headers=headers["scientist"]).json()
    best = result["candidates"][0]
    assert best["rank"] == 1
    assert best["metrics"]["protein_g_per_100g"] == pytest.approx(0.7 * 22 + 0.3 * 10, abs=0.05)


def test_optimization_infeasible(client, headers, saved):  # type: ignore[no-untyped-def]
    resp = client.post(
        "/api/formulations/frm_test/jobs",
        json={
            "type": "optimization",
            "params": {
                "objectives": [{"target": "cost_per_kg", "direction": "minimize"}],
                "constraints": {"nutrient_minimums": [{"key": "protein", "min": 40, "unit": "g"}]},
                "seed": 1,
            },
        },
        headers=headers["scientist"],
    )
    job_id = resp.json()["job_id"]
    status = client.get(f"/api/jobs/{job_id}", headers=headers["scientist"]).json()
    assert status["status"] == "failed"
    assert status["error"]["code"] == "infeasible"
    assert "protein" in status["error"]["message"].lower()


def test_job_limit(client, headers, saved, db, monkeypatch):  # type: ignore[no-untyped-def]
    from app.config import get_settings

    for _ in range(get_settings().max_active_jobs_per_user):
        db.add(
            Job(
                id=new_id("job"),
                formulation_id="frm_test",
                formulation_version=1,
                type="optimization",
                status="running",
                params={},
                created_by="usr_scientist",
            )
        )
    db.commit()
    resp = client.post(
        "/api/formulations/frm_test/jobs", json={"type": "nutrition"}, headers=headers["scientist"]
    )
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "job_limit_reached"


def test_unused_imports_guard() -> None:
    assert Decimal and time
