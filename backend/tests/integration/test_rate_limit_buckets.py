"""Rate-limit buckets for stream tokens, job starts and cancellations stay independent."""

import pytest
from app.core.ids import new_id
from app.db.models import (
    AminoAcidReferencePattern,
    Formulation,
    FormulationVersion,
    Job,
)

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
def saved_formulation(db, users, catalog):  # type: ignore[no-untyped-def]
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
    db.add(Formulation(id="frm_test", owner_id="usr_scientist", name="Test", current_version=1))
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


def test_stream_token_budget_is_independent_from_job_start_and_cancel(
    client, headers, saved_formulation, db
):
    start_url = "/api/formulations/frm_test/jobs"
    start_body = {"type": "nutrition"}
    caller_headers = headers["scientist"]

    first_job = client.post(start_url, json=start_body, headers=caller_headers)
    assert first_job.status_code == 202, first_job.text
    job_id = first_job.json()["job_id"]
    stream_token_url = f"/api/jobs/{job_id}/stream-token"

    for request_number in range(1, 32):
        response = client.post(stream_token_url, headers=caller_headers)
        assert response.status_code == 200, f"token request {request_number}: {response.text}"

    cancellable_job = Job(
        id=new_id("job"),
        formulation_id="frm_test",
        formulation_version=1,
        type="optimization",
        status="queued",
        params={},
        created_by="usr_scientist",
    )
    db.add(cancellable_job)
    db.commit()
    cancel = client.post(f"/api/jobs/{cancellable_job.id}/cancel", headers=caller_headers)
    assert cancel.status_code == 202, cancel.text
    assert cancel.json()["accepted"] is True

    second_job = client.post(start_url, json=start_body, headers=caller_headers)
    assert second_job.status_code == 202, second_job.text

    for request_number in range(32, 61):
        response = client.post(stream_token_url, headers=caller_headers)
        assert response.status_code == 200, f"token request {request_number}: {response.text}"

    sixty_first = client.post(stream_token_url, headers=caller_headers)
    assert sixty_first.status_code == 429
    assert sixty_first.json()["error"]["code"] == "rate_limited"
