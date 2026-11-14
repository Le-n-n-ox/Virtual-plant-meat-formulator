"""Evidence assistant: language-model explanations of stored results (never values)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import ScientistDep, SessionDep, SettingsDep, ViewerDep, audit
from app.api.errors import ApiError
from app.db.models import Candidate, Job, JobResult, ModelRegistry
from app.mlops.registry import model_detail
from app.services.llm import EvidenceExplainer, LlmUnavailable

router = APIRouter(tags=["assistant"])


class ExplainRequest(BaseModel):
    question: str | None = Field(default=None, max_length=2000)


def get_explainer(settings: SettingsDep) -> EvidenceExplainer:
    return EvidenceExplainer(settings)


ExplainerDep = Annotated[EvidenceExplainer, Depends(get_explainer)]


def _models_context(session: Session, model_ids: list[str] | None) -> list[dict[str, Any]]:
    details = []
    for model_id in model_ids or []:
        row = session.get(ModelRegistry, model_id)
        if row is not None:
            details.append(model_detail(row))
    return details


def _job_context(job: Job) -> dict[str, Any]:
    return {
        "type": job.type,
        "status": job.status,
        "params": job.params,
        "data_versions": job.data_versions,
        "model_ids": job.model_ids,
        "calc_version": job.calc_version,
        "seed": job.seed,
    }


def _run(
    explainer: EvidenceExplainer, context: dict[str, Any], question: str | None
) -> dict[str, Any]:
    try:
        return explainer.explain(context, question)
    except LlmUnavailable as exc:
        raise ApiError(
            503,
            "dependency_unavailable",
            "The explanation service is unavailable.",
            {"dependency": "nvidia_llm"},
        ) from exc


def _owned_job(session: Session, job_id: str, user_id: str) -> Job:
    job = session.get(Job, job_id)
    if job is None or job.created_by != user_id:
        raise ApiError(404, "not_found", "Job not found.")
    return job


@router.get("/assistant/status")
def assistant_status(user: ViewerDep, settings: SettingsDep) -> dict[str, Any]:
    configured = settings.nvidia_configured
    return {
        "configured": configured,
        "model": settings.nvidia_model if configured else None,
        "role": "explanation_only",
    }


@router.post("/jobs/{job_id}/explain")
def explain_job(
    job_id: str,
    user: ScientistDep,
    session: SessionDep,
    explainer: ExplainerDep,
    body: ExplainRequest | None = None,
) -> dict[str, Any]:
    job = _owned_job(session, job_id, user.user_id)
    result = session.query(JobResult).filter(JobResult.job_id == job.id).first()
    if result is None:
        raise ApiError(409, "result_not_ready", "The job has no stored result yet.")
    context = {
        "job": _job_context(job),
        "result": result.payload,
        "models": _models_context(session, job.model_ids),
    }
    out = _run(explainer, context, body.question if body else None)
    audit(
        session, actor_id=user.user_id, action="assistant.explain", entity="job", entity_id=job.id
    )
    return out


@router.post("/candidates/{candidate_id}/explain")
def explain_candidate(
    candidate_id: str,
    user: ScientistDep,
    session: SessionDep,
    explainer: ExplainerDep,
    body: ExplainRequest | None = None,
) -> dict[str, Any]:
    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise ApiError(404, "not_found", "Candidate not found.")
    job = _owned_job(session, candidate.job_id, user.user_id)
    context = {
        "job": _job_context(job),
        "candidate": {
            "id": candidate.id,
            "rank": candidate.rank,
            "lines": candidate.lines,
            "metrics": candidate.metrics,
            "predictions": candidate.predictions,
            "warnings": candidate.warnings,
            "cost": float(candidate.cost) if candidate.cost is not None else None,
            "pareto": candidate.pareto,
            "model_ids": candidate.model_ids,
        },
        "models": _models_context(session, candidate.model_ids),
    }
    out = _run(explainer, context, body.question if body else None)
    audit(
        session,
        actor_id=user.user_id,
        action="assistant.explain",
        entity="candidate",
        entity_id=candidate.id,
    )
    return out


@router.post("/models/{model_id}/explain")
def explain_model(
    model_id: str,
    user: ViewerDep,
    session: SessionDep,
    explainer: ExplainerDep,
    body: ExplainRequest | None = None,
) -> dict[str, Any]:
    row = session.get(ModelRegistry, model_id)
    if row is None:
        raise ApiError(404, "not_found", "Model not found.")
    context = {"model": model_detail(row)}
    question = (body.question if body else None) or (
        "Explain this model's limitations, validation metrics and permitted uses."
    )
    return _run(explainer, context, question)
