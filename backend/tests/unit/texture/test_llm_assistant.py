import httpx
import pytest
from app.api.routers import assistant
from app.config import Settings
from app.core.ids import new_id
from app.db.models import Candidate, Formulation, Job, JobResult
from app.services.llm import EvidenceExplainer, LlmUnavailable
from fastapi.testclient import TestClient

CONFIGURED = {
    "nvidia_api_key": "k-test",
    "nvidia_model": "nvidia/test",
    "nvidia_base_url": "https://llm.test/v1",
}


def explainer(content, status=200, extra=None):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        msg = {"content": content, **(extra or {})}
        return httpx.Response(status, json={"choices": [{"message": msg}]})

    return EvidenceExplainer(Settings(**CONFIGURED), transport=httpx.MockTransport(handler)), seen


def test_think_stripped_and_numbers_checked():
    ex, seen = explainer(
        "<think>secretly 99 reasoning</think>Hardness is 42.1 N (interval 35 to 49.3), maybe 77.",
        extra={"reasoning_content": "hidden 123"},
    )
    out = ex.explain({"value": 42.1, "interval": [35.0, 49.3]}, "why?")
    assert "think" not in out["text"] and "99" not in out["text"] and "123" not in out["text"]
    assert out["numbers_check"] == {"unverified_numbers": ["77"], "passed": False}
    assert seen["url"] == "https://llm.test/v1/chat/completions"
    assert seen["auth"] == "Bearer k-test"
    assert out["disclaimer"] and out["model"] == "nvidia/test"
    ok, _ = explainer("Value 42.")
    assert ok.explain({"value": 42.1})["numbers_check"]["passed"]


def test_unavailable():
    with pytest.raises(LlmUnavailable):
        EvidenceExplainer(Settings(nvidia_api_key=None, nvidia_model=None)).explain({})
    ex, _ = explainer("x", status=500)
    with pytest.raises(LlmUnavailable):
        ex.explain({})


@pytest.fixture()
def app_client(client, db, users):
    app = client.app
    if not any(getattr(r, "path", "") == "/api/assistant/status" for r in app.routes):
        app.include_router(assistant.router, prefix="/api")
    ex, _ = explainer("Hardness is 42.1 N.")
    app.dependency_overrides[assistant.get_explainer] = lambda: ex
    return client


def _job(job_id):
    return Job(
        id=job_id,
        type="texture_prediction",
        status="succeeded",
        params={},
        created_by="usr_scientist",
    )


def test_assistant_endpoints(app_client, db, headers):
    c: TestClient = app_client
    status = c.get("/api/assistant/status", headers=headers["viewer"]).json()
    assert status["role"] == "explanation_only" and "configured" in status
    db.add(_job("job_1"))
    db.add(Formulation(id="frm_1", owner_id="usr_scientist", name="f"))
    db.commit()
    assert c.post("/api/jobs/job_1/explain", headers=headers["scientist"]).status_code == 409
    db.add(JobResult(job_id="job_1", kind="texture", payload={"predictions": [{"value": 42.1}]}))
    db.add(Candidate(id="cand_1", job_id="job_1", formulation_id="frm_1", rank=1, lines=[]))
    db.commit()
    r = c.post("/api/jobs/job_1/explain", json={"question": "why"}, headers=headers["scientist"])
    assert r.status_code == 200 and r.json()["numbers_check"]["passed"]
    assert c.post("/api/jobs/job_1/explain", headers=headers["other"]).status_code == 404
    assert c.post("/api/jobs/job_1/explain", headers=headers["viewer"]).status_code == 403
    assert c.post("/api/candidates/cand_1/explain", headers=headers["scientist"]).status_code == 200
    assert c.post("/api/candidates/cand_1/explain", headers=headers["other"]).status_code == 404
    missing = c.post(f"/api/models/{new_id('mdl')}/explain", headers=headers["viewer"])
    assert missing.status_code == 404


def test_endpoint_503_when_unconfigured(app_client, headers, db):
    app_client.app.dependency_overrides[assistant.get_explainer] = lambda: EvidenceExplainer(
        Settings(nvidia_api_key=None, nvidia_model=None)
    )
    db.add(_job("job_2"))
    db.add(JobResult(job_id="job_2", kind="texture", payload={}))
    db.commit()
    r = app_client.post("/api/jobs/job_2/explain", headers=headers["scientist"])
    assert r.status_code == 503
    assert r.json()["error"]["details"] == {"dependency": "nvidia_llm"}
