"""Results, candidates, compare and export endpoints."""

import csv
import io
from datetime import UTC, datetime, timedelta

import pytest
from app.db.models import (
    Candidate,
    DataSource,
    Formulation,
    FormulationVersion,
    Job,
    JobResult,
    ModelRegistry,
)


@pytest.fixture(autouse=True)
def _shared_memory_db(monkeypatch):
    # app.db.session.build_engine only shares one connection for ":memory:" URLs
    # ("sqlite://".rstrip("/") never matches its endswith check), so use the explicit form.
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")


NUTRITION = {
    "basis": "per_100g_as_formulated",
    "nutrients": [
        {
            "key": "protein",
            "value": 21.437,
            "unit": "g",
            "flag": "calculated",
            "range": [19.9, 22.8],
            "contains_estimated": False,
            "missing_ingredient_ids": [],
        },
        {
            "key": "vitamin_b12",
            "value": None,
            "unit": "ug",
            "flag": "calculated",
            "reason": "missing_data",
            "missing_ingredient_ids": ["ing_bean"],
        },
    ],
    "amino_acids": {
        "per_g_protein_mg": [{"key": "lysine", "value": 48.2123}],
        "reference_pattern": {"id": "aap_1", "name": "ref", "version": "1"},
        "scores": [{"key": "lysine", "score": 0.8417}],
        "limiting_amino_acid": "lysine",
        "score": 0.8417,
        "method": "AAS",
        "complete": True,
        "missing": [],
    },
    "calc_version": "abc123",
    "data_versions": {"ingredients": "test.1"},
}
TEXTURE = {
    "predictions": [
        {
            "target": "hardness",
            "value": 42.1357,
            "unit": "N",
            "interval": [35.0, 49.3],
            "interval_level": 0.9,
            "in_domain": False,
            "model": {"id": "mdl_1", "target": "hardness"},
        }
    ],
    "warnings": [],
    "process": {},
}


def _job(db, jid, type_, version=1, status="completed", days=0, model_ids=None):
    when = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=days)
    job = Job(
        id=jid,
        formulation_id="frm_1",
        formulation_version=version,
        type=type_,
        status=status,
        created_by="usr_scientist",
        created_at=when,
        started_at=when,
        finished_at=when,
        data_versions={"ingredients": "test.1"},
        model_ids=model_ids or [],
        calc_version="abc123",
        seed=7,
    )
    db.add(job)
    return job


@pytest.fixture()
def data(db, users, catalog):
    db.add(Formulation(id="frm_1", owner_id="usr_scientist", name="My Burger!", current_version=1))
    db.add(
        FormulationVersion(
            formulation_id="frm_1",
            version=1,
            name="My Burger!",
            lines=[
                {"ingredient_id": "ing_bean", "percent": "60"},
                {"ingredient_id": "ing_sorghum", "percent": "40"},
            ],
            targets=None,
            note=None,
            content_hash="h" * 64,
            created_by="usr_scientist",
        )
    )
    db.add(
        ModelRegistry(
            id="mdl_1",
            target="hardness",
            unit="N",
            algorithm="gaussian_process",
            version="3",
            status="approved",
            training_set_size=64,
        )
    )
    db.flush()
    _job(db, "job_n_old", "nutrition", days=0)
    _job(db, "job_n", "nutrition", days=2)
    _job(db, "job_t", "texture_prediction", days=2, model_ids=["mdl_1"])
    _job(db, "job_o1", "optimization", days=1)
    _job(db, "job_o2", "optimization", days=3)
    db.flush()
    old = {**NUTRITION, "nutrients": [{"key": "protein", "value": 1.0, "unit": "g"}]}
    db.add(JobResult(job_id="job_n_old", kind="nutrition", payload=old))
    db.add(JobResult(job_id="job_n", kind="nutrition", payload=NUTRITION))
    db.add(JobResult(job_id="job_t", kind="texture", payload=TEXTURE))
    for cid, job, rank, pareto, protein, pct in [
        ("cand_a", "job_o1", 1, True, 20.0, 60.0),
        ("cand_b", "job_o2", 1, True, 22.5, 55.0),
        ("cand_c", "job_o2", 2, False, 21.0, 50.0),
    ]:
        db.add(
            Candidate(
                id=cid,
                job_id=job,
                formulation_id="frm_1",
                rank=rank,
                pareto=pareto,
                lines=[
                    {"ingredient_id": "ing_bean", "percent": pct},
                    {"ingredient_id": "ing_sorghum", "percent": 100 - pct},
                ],
                metrics={
                    "protein_g_per_100g": protein,
                    "amino_acid_score": 0.8,
                    "cost_per_kg": {"value": 400 + rank, "currency": "KES"},
                },
                predictions=[{"target": "hardness", "value": 40.0 + rank, "unit": "N"}],
                model_ids=["mdl_1"],
                warnings=[],
                scene={},
            )
        )
    db.commit()


def test_nutrition_404_hint(client, headers, db, users):
    db.add(Formulation(id="frm_1", owner_id="usr_scientist", name="x", current_version=1))
    db.commit()
    r = client.get("/api/formulations/frm_1/nutrition", headers=headers["scientist"])
    assert r.status_code == 404
    assert r.json()["error"]["details"]["hint"] == "start a nutrition job"


def test_nutrition_found_latest(client, headers, data):
    r = client.get("/api/formulations/frm_1/nutrition", headers=headers["scientist"])
    assert r.status_code == 200
    body = r.json()
    assert body["job_id"] == "job_n"
    assert body["formulation_version"] == 1
    assert body["nutrients"][0]["value"] == 21.437
    assert body["finished_at"].endswith("Z")
    assert (
        client.get(
            "/api/formulations/frm_1/nutrition?version=2", headers=headers["scientist"]
        ).status_code
        == 404
    )


def test_candidates_list_pareto_paging(client, headers, data):
    h = headers["scientist"]
    body = client.get("/api/formulations/frm_1/candidates", headers=h).json()
    assert [c["id"] for c in body["items"]] == ["cand_b", "cand_c", "cand_a"]
    assert body["total"] == 3
    assert body["items"][0]["scene"] == {"visual_basis": "illustrative", "variables": []}
    assert isinstance(body["items"][0]["lines"][0]["percent"], float)
    par = client.get("/api/formulations/frm_1/candidates?pareto=true", headers=h).json()
    assert [c["id"] for c in par["items"]] == ["cand_b", "cand_a"]
    job = client.get("/api/formulations/frm_1/candidates?job_id=job_o1", headers=h).json()
    assert [c["id"] for c in job["items"]] == ["cand_a"]
    page = client.get("/api/formulations/frm_1/candidates?page=2&page_size=2", headers=h).json()
    assert [c["id"] for c in page["items"]] == ["cand_a"]
    assert page["total"] == 3
    other = client.get("/api/formulations/frm_1/candidates", headers=headers["other"])
    assert other.status_code == 404


def test_candidate_detail_and_ownership(client, headers, data):
    assert client.get("/api/candidates/cand_a", headers=headers["scientist"]).status_code == 200
    assert client.get("/api/candidates/cand_a", headers=headers["other"]).status_code == 404
    assert client.get("/api/candidates/nope", headers=headers["scientist"]).status_code == 404


def test_promote(client, headers, data, db):
    r = client.post(
        "/api/candidates/cand_a/promote", json={"name": "Promoted"}, headers=headers["scientist"]
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Promoted"
    assert body["version"] == 1 and body["current_version"] == 1
    assert body["owner_id"] == "usr_scientist"
    assert body["lines"][0] == {"ingredient_id": "ing_bean", "percent": "60.0"}
    assert body["note"] == "Promoted from candidate cand_a"
    assert len(body["content_hash"]) == 64
    db.expire_all()
    assert db.get(Candidate, "cand_a").promoted_formulation_id == body["id"]
    assert db.get(Formulation, body["id"]).current_version == 1
    denied = client.post("/api/candidates/cand_b/promote", headers=headers["other"])
    assert denied.status_code == 404


def test_compare(client, headers, data):
    h = headers["scientist"]
    r = client.get("/api/compare?ids=cand_a,cand_b", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert [i["id"] for i in body["items"]] == ["cand_a", "cand_b"]
    diffs = {d["metric"]: d for d in body["differences"]}
    assert diffs["protein_g_per_100g"]["delta"] == 2.5
    assert diffs["cost_per_kg.value"]["unit"] == "KES"
    assert diffs["hardness"]["unit"] == "N"
    assert diffs["percent:ing_bean"]["delta"] == -5.0
    assert diffs["percent:ing_bean"]["unit"] == "%"
    assert client.get("/api/compare?ids=cand_a", headers=h).status_code == 400
    assert client.get("/api/compare?ids=cand_a,cand_b,cand_c", headers=h).status_code == 400
    assert client.get("/api/compare?ids=cand_a,cand_b", headers=headers["other"]).status_code == 404


def test_export_csv_equals_stored(client, headers, data, db):
    r = client.get("/api/formulations/frm_1/export?format=csv", headers=headers["scientist"])
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="my-burger-v1.csv"'
    rows = list(csv.DictReader(io.StringIO(r.text)))
    by = {(x["section"], x["key"]): x for x in rows}
    assert by[("line", "ing_bean")]["value"] == "60"
    assert by[("line", "ing_bean")]["label"] == "Fake bean flour"
    prot = by[("nutrient", "protein")]
    assert prot["value"] == str(NUTRITION["nutrients"][0]["value"])
    assert (prot["lower"], prot["upper"]) == ("19.9", "22.8")
    assert by[("nutrient", "vitamin_b12")]["note"] == "missing_data"
    assert by[("amino_acid", "aas")]["label"] == "AAS (unadjusted amino-acid score)"
    assert by[("amino_acid", "aas")]["value"] == "0.8417"
    pred = by[("prediction", "hardness")]
    assert pred["value"] == "42.1357"
    assert pred["flag"] == "in_domain=False"
    assert pred["label"] == "literature-derived estimate"
    assert by[("model", "mdl_1")]["note"] == "gaussian_process"
    assert ("source", "src_test") in by
    assert ("audit", "job_n") in by
    assert "DIAAS" not in r.text
    assert any(x["section"] == "audit" and x["key"] == "exported_at" for x in rows)


def test_export_pdf(client, headers, data):
    r = client.get("/api/formulations/frm_1/export?format=pdf", headers=headers["scientist"])
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="my-burger-v1.pdf"'


def test_export_bad_format_and_no_results(client, headers, db, users):
    db.add(Formulation(id="frm_2", owner_id="usr_scientist", name="Empty", current_version=1))
    db.add(
        FormulationVersion(
            formulation_id="frm_2",
            version=1,
            name="Empty",
            lines=[],
            targets=None,
            note=None,
            content_hash="h" * 64,
            created_by="usr_scientist",
        )
    )
    db.commit()
    h = headers["scientist"]
    assert client.get("/api/formulations/frm_2/export?format=xml", headers=h).status_code == 400
    r = client.get("/api/formulations/frm_2/export?format=csv", headers=h)
    assert r.status_code == 200
    assert "not calculated" in r.text
    assert client.get("/api/formulations/frm_2/export?format=pdf", headers=h).status_code == 200
    other = client.get("/api/formulations/frm_2/export?format=csv", headers=headers["other"])
    assert other.status_code == 404


def test_export_restricted_excluded(client, headers, data, db, catalog):
    db.add(DataSource(id="src_r", name="Restricted DB", license_status="restricted"))
    db.flush()
    catalog["ing_sorghum"].source_id = "src_r"
    db.commit()
    r = client.get("/api/formulations/frm_1/export?format=csv", headers=headers["scientist"])
    rows = list(csv.DictReader(io.StringIO(r.text)))
    ing_rows = [x for x in rows if x["section"] == "ingredient_nutrient"]
    assert ing_rows
    assert all(x["note"] == "ing_bean" for x in ing_rows)
    assert any(x["section"] == "note" and "restricted" in x["note"] for x in rows)
    # mixture totals from stored results are still present
    assert any(x["section"] == "nutrient" and x["key"] == "protein" for x in rows)
    from app.db.models import AuditLog

    db.expire_all()
    assert db.query(AuditLog).filter_by(action="export").count() == 1


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/formulations/frm_1/nutrition"),
        ("get", "/api/formulations/frm_1/candidates"),
        ("get", "/api/candidates/cand_a"),
        ("post", "/api/candidates/cand_a/promote"),
        ("get", "/api/compare?ids=cand_a,cand_b"),
        ("get", "/api/formulations/frm_1/export?format=csv"),
    ],
)
def test_viewer_forbidden(client, headers, data, method, path):
    r = getattr(client, method)(path, headers=headers["viewer"])
    assert r.status_code == 403
