"""Job routes: start, list, status, stream token, SSE events, result, cancel, training."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import (
    AdminDep,
    PagingDep,
    RequestIdDep,
    ScientistDep,
    SessionDep,
    SettingsDep,
    audit,
)
from app.api.errors import ApiError
from app.api.sse import SSE_HEADERS, job_event_stream
from app.core.ids import iso, utcnow
from app.core.limits import get_limits
from app.core.security import (
    TokenError,
    issue_stream_token,
    verify_stream_token,
)
from app.db.models import Formulation, Job, JobResult
from app.jobs.events import TERMINAL_STATUSES
from app.jobs.runner import get_bus, get_runner
from app.jobs.service import (
    create_job,
    duration_ms,
    job_status_payload,
    lines_of,
    validate_job_params,
)
from app.jobs.tasks import CANCELLABLE
from app.schemas.jobs import JobCreate, TrainRequest

router = APIRouter(tags=["jobs"])


def _owned_job(session: Session, job_id: str, user_id: str) -> Job:
    job = session.get(Job, job_id)
    if job is None or job.created_by != user_id:
        raise ApiError(404, "not_found", "Job not found.")
    return job


def _created_response(job: Job, created: bool) -> JSONResponse:
    return JSONResponse(
        status_code=202,
        content={
            "job_id": job.id,
            "type": job.type,
            "status": job.status,
            "formulation_id": job.formulation_id,
            "formulation_version": job.formulation_version,
            "created_at": iso(job.created_at),
            "idempotent_replay": not created,
        },
    )


@router.post("/formulations/{formulation_id}/jobs", status_code=202)
def start_job(
    formulation_id: str,
    body: JobCreate,
    session: SessionDep,
    settings: SettingsDep,
    user: ScientistDep,
    rid: RequestIdDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    from app.db.repositories.formulations import get_owned_formulation, get_version
    from app.db.repositories.ingredients import load_ingredient_data
    from app.domain.validation import validate_formulation

    formulation = get_owned_formulation(session, formulation_id, user)
    if idempotency_key:
        existing = session.execute(
            select(Job).where(
                Job.created_by == user.user_id, Job.idempotency_key == idempotency_key
            )
        ).scalar_one_or_none()
        if existing is not None:
            return _created_response(existing, False)
    version_row = get_version(session, formulation.id, body.version)
    lines = lines_of(version_row)
    ingredients = load_ingredient_data(session, [ln.ingredient_id for ln in lines])
    check = validate_formulation(lines, ingredients, version_row.targets, new_version=False)
    if not check.valid:
        raise ApiError(
            422,
            "validation_failed",
            "The formulation version is not valid.",
            {"issues": check.to_dict()["issues"]},
        )
    params = validate_job_params(session, settings, body.type, body.params or {}, lines)
    job, created = create_job(
        session,
        settings,
        user,
        formulation=formulation,
        version=version_row.version,
        job_type=body.type,
        params=params,
        idempotency_key=idempotency_key,
        request_id=rid,
    )
    session.commit()
    if created:
        get_runner().submit(job.id)
        session.refresh(job)
    return _created_response(job, created)


@router.post("/admin/models/train", status_code=202)
def train_model(
    body: TrainRequest,
    session: SessionDep,
    settings: SettingsDep,
    user: AdminDep,
    rid: RequestIdDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    import secrets

    seed = body.seed if body.seed is not None else secrets.randbelow(2**31 - 1)
    job, created = create_job(
        session,
        settings,
        user,
        formulation=None,
        version=None,
        job_type="model_training",
        params={"target": body.target, "seed": seed, "dataset": body.dataset},
        idempotency_key=idempotency_key,
        request_id=rid,
    )
    session.commit()
    if created:
        get_runner().submit(job.id)
        session.refresh(job)
    return _created_response(job, created)


@router.get("/jobs")
def list_jobs(
    session: SessionDep,
    settings: SettingsDep,
    user: ScientistDep,
    paging: PagingDep,
    status: str | None = None,
    type: str | None = None,  # noqa: A002 - public query name
    formulation_id: str | None = None,
) -> dict[str, object]:
    from app.jobs.recovery import fail_stale_jobs

    if fail_stale_jobs(settings, user_id=user.user_id):
        session.expire_all()
    stmt = select(Job).where(Job.created_by == user.user_id)
    if status:
        stmt = stmt.where(Job.status.in_([s.strip() for s in status.split(",") if s.strip()]))
    if type:
        stmt = stmt.where(Job.type == type)
    if formulation_id:
        stmt = stmt.where(Job.formulation_id == formulation_id)
    total = session.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        session.execute(
            stmt.order_by(Job.created_at.desc()).offset(paging.offset).limit(paging.page_size)
        )
        .scalars()
        .all()
    )
    names = {}
    ids = {r.formulation_id for r in rows if r.formulation_id}
    if ids:
        names = {
            fid: fname
            for fid, fname in session.execute(
                select(Formulation.id, Formulation.name).where(Formulation.id.in_(ids))
            ).all()
        }
    items = [
        {
            "id": r.id,
            "type": r.type,
            "formulation": (
                {
                    "id": r.formulation_id,
                    "name": names.get(r.formulation_id),
                    "version": r.formulation_version,
                }
                if r.formulation_id
                else None
            ),
            "status": r.status,
            "stage_label": r.stage_label,
            "progress_percent": r.progress_percent,
            "created_at": iso(r.created_at),
            "started_at": iso(r.started_at),
            "finished_at": iso(r.finished_at),
            "duration_ms": duration_ms(r),
        }
        for r in rows
    ]
    return paging.envelope(items, total)


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str, session: SessionDep, settings: SettingsDep, user: ScientistDep
) -> dict[str, object]:
    from app.jobs.recovery import fail_stale_jobs

    job = _owned_job(session, job_id, user.user_id)
    if job.status in ("queued", "running") and fail_stale_jobs(settings, job_id=job.id):
        session.refresh(job)
    return job_status_payload(session, job)


@router.post("/jobs/{job_id}/stream-token")
def stream_token(
    job_id: str, session: SessionDep, settings: SettingsDep, user: ScientistDep
) -> dict[str, object]:
    job = _owned_job(session, job_id, user.user_id)
    token, expires_at = issue_stream_token(settings, job.id, user.user_id)
    from datetime import UTC, datetime

    return {"token": token, "expires_at": iso(datetime.fromtimestamp(expires_at, UTC))}


@router.get("/jobs/{job_id}/events")
async def job_events(
    job_id: str,
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
    token: Annotated[str | None, Query()] = None,
    after_seq: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    if not token:
        raise ApiError(401, "unauthenticated", "A stream token is required (?token=).")
    try:
        claims = verify_stream_token(settings, token, job_id)
    except TokenError as exc:
        raise ApiError(401, "unauthenticated", "Invalid or expired stream token.") from exc
    job = session.get(Job, job_id)
    if job is None or job.created_by != claims.user_id:
        raise ApiError(404, "not_found", "Job not found.")
    limits = get_limits()
    if not limits.consume_nonce(claims.nonce, claims.expires_at):
        raise ApiError(401, "unauthenticated", "Stream token already used; request a new one.")
    start = 0
    if last_event_id and last_event_id.strip().isdigit():
        start = int(last_event_id.strip())
    elif after_seq is not None:
        start = after_seq
    if not limits.acquire_stream(claims.user_id, settings.max_streams_per_user):
        raise ApiError(429, "rate_limited", "Too many concurrent streams.")
    session.close()
    generator = job_event_stream(
        job_id,
        start,
        get_bus(),
        heartbeat_seconds=settings.sse_heartbeat_seconds,
        is_disconnected=request.is_disconnected,
        on_close=lambda: limits.release_stream(claims.user_id),
    )
    return StreamingResponse(generator, media_type="text/event-stream", headers=SSE_HEADERS)


@router.get("/jobs/{job_id}/result")
def job_result(job_id: str, session: SessionDep, user: ScientistDep) -> dict[str, object]:
    job = _owned_job(session, job_id, user.user_id)
    result = session.execute(
        select(JobResult).where(JobResult.job_id == job.id)
    ).scalar_one_or_none()
    if job.status != "completed" or result is None:
        raise ApiError(
            409, "result_not_ready", "The job has not completed.", {"status": job.status}
        )
    payload = dict(result.payload)
    if result.kind == "optimization":
        from app.db.models import Candidate

        rows = (
            session.execute(
                select(Candidate).where(Candidate.job_id == job.id).order_by(Candidate.rank)
            )
            .scalars()
            .all()
        )
        payload["candidates"] = [
            {"id": c.id, "rank": c.rank, "pareto": c.pareto, "metrics": c.metrics} for c in rows
        ]
    return {
        "job_id": job.id,
        "kind": result.kind,
        "payload": payload,
        **payload,
        "calc_version": job.calc_version,
        "data_versions": job.data_versions or {},
        "model_ids": job.model_ids or [],
        "seed": job.seed,
    }


@router.post("/jobs/{job_id}/cancel", status_code=202)
def cancel_job(
    job_id: str, session: SessionDep, user: ScientistDep, rid: RequestIdDep
) -> dict[str, object]:
    job = _owned_job(session, job_id, user.user_id)
    if job.status in TERMINAL_STATUSES:
        raise ApiError(
            409, "job_already_finished", "The job has already finished.", {"status": job.status}
        )
    if job.type not in CANCELLABLE:
        raise ApiError(409, "cancel_not_supported", f"{job.type} jobs cannot be cancelled.")
    if job.cancel_requested_at is None:
        job.cancel_requested_at = utcnow()
        audit(
            session,
            actor_id=user.user_id,
            action="job_cancel",
            entity="job",
            entity_id=job.id,
            request_id=rid,
        )
    if job.status == "queued" and get_runner().__class__.__name__ == "CeleryRunner":
        # Not yet picked up: the worker will see the flag and emit job.cancelled first.
        pass
    return {"accepted": True}
