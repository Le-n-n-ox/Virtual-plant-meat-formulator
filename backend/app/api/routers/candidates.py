"""Candidate listing, detail, promotion and comparison."""

from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.deps import PagingDep, RequestIdDep, ScientistDep, SessionDep, audit
from app.api.errors import ApiError
from app.db.repositories import results as repo
from app.schemas.results import CandidateOut, CompareOut, PromotedFormulationOut, PromoteIn

router = APIRouter(tags=["candidates"])


@router.get("/formulations/{formulation_id}/candidates")
def list_candidates(
    formulation_id: str,
    session: SessionDep,
    user: ScientistDep,
    paging: PagingDep,
    job_id: str | None = None,
    pareto: Annotated[bool | None, Query()] = None,
) -> dict[str, Any]:
    repo.get_owned_formulation(session, formulation_id, user)
    items, total = repo.list_candidates(
        session,
        formulation_id,
        job_id=job_id,
        pareto=pareto,
        offset=paging.offset,
        limit=paging.page_size,
    )
    return paging.envelope([repo.candidate_payload(c) for c in items], total)


@router.get("/compare", response_model=CompareOut)
def compare(session: SessionDep, user: ScientistDep, ids: str = "") -> dict[str, Any]:
    parts = [p.strip() for p in ids.split(",") if p.strip()]
    if len(parts) != 2 or parts[0] == parts[1]:
        raise ApiError(400, "bad_request", "Provide exactly two distinct candidate ids.")
    a, b = (repo.candidate_payload(repo.get_owned_candidate(session, i, user)) for i in parts)
    return {"items": [a, b], "differences": repo.compare_candidates(a, b)}


@router.get("/candidates/{candidate_id}", response_model=CandidateOut)
def get_candidate(candidate_id: str, session: SessionDep, user: ScientistDep) -> dict[str, Any]:
    return repo.candidate_payload(repo.get_owned_candidate(session, candidate_id, user))


@router.post(
    "/candidates/{candidate_id}/promote", status_code=201, response_model=PromotedFormulationOut
)
def promote(
    candidate_id: str,
    session: SessionDep,
    user: ScientistDep,
    request_id: RequestIdDep,
    body: PromoteIn | None = None,
) -> dict[str, Any]:
    candidate = repo.get_owned_candidate(session, candidate_id, user)
    result = repo.promote_candidate(session, candidate, user, body.name if body else None)
    audit(
        session,
        actor_id=user.user_id,
        action="promote_candidate",
        entity="formulation",
        entity_id=result["id"],
        payload={"candidate_id": candidate_id},
        request_id=request_id,
    )
    return result
