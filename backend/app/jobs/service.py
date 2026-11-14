"""Job creation: re-validation, type-specific params checks, limits and idempotency."""

from __future__ import annotations

import secrets
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, audit
from app.api.errors import ApiError
from app.config import Settings
from app.core.ids import iso, new_id
from app.db.models import Candidate, Formulation, Job, JobResult
from app.domain.types import Line

ACTIVE = ("queued", "running")
TEXTURE_PROCESS_FIELDS = {"target_moisture": "moisture_percent"}


def _issues(*items: tuple[str, str, str]) -> dict[str, Any]:
    return {"issues": [{"code": c, "field": f, "message": m} for c, f, m in items]}


def check_job_limit(session: Session, user: CurrentUser, settings: Settings) -> None:
    active = session.execute(
        select(func.count())
        .select_from(Job)
        .where(Job.created_by == user.user_id, Job.status.in_(ACTIVE))
    ).scalar_one()
    if active >= settings.max_active_jobs_per_user:
        raise ApiError(
            409,
            "job_limit_reached",
            f"You already have {active} active jobs; wait for one to finish.",
            {"active_jobs": active, "limit": settings.max_active_jobs_per_user},
        )


def validate_job_params(
    session: Session,
    settings: Settings,
    job_type: str,
    params: dict[str, Any],
    lines: list[Line],
) -> dict[str, Any]:
    """Return normalised params or raise 422 validation_failed / model_unavailable."""
    from app.db.repositories.ingredients import get_pattern

    params = dict(params or {})
    if job_type == "nutrition":
        get_pattern(session, params.get("amino_acid_pattern_id"))
        return params

    if job_type == "texture_prediction":
        from app.services.texture import TextureService

        targets = params.get("targets")
        process = params.get("process")
        problems: list[tuple[str, str, str]] = []
        if (
            not isinstance(targets, list)
            or not targets
            or not all(isinstance(t, str) for t in targets)
        ):
            problems.append(("missing_field", "params.targets", "List at least one target."))
        if not isinstance(process, dict):
            problems.append(
                ("missing_field", "params.process", "Process conditions are required model inputs.")
            )
        if problems:
            raise ApiError(
                422, "validation_failed", "Texture job parameters are invalid.", _issues(*problems)
            )
        assert isinstance(targets, list) and isinstance(process, dict)
        models = TextureService(session, settings).require_models(targets)
        missing_fields = sorted(
            {
                f"params.process.{TEXTURE_PROCESS_FIELDS[f]}"
                for m in models.values()
                for f in (m.feature_schema or {}).get("features", [])
                if f in TEXTURE_PROCESS_FIELDS and process.get(TEXTURE_PROCESS_FIELDS[f]) is None
            }
        )
        if missing_fields:
            raise ApiError(
                422,
                "validation_failed",
                "Process conditions required by the approved models are missing.",
                _issues(*[("missing_field", f, f"{f} is required.") for f in missing_fields]),
            )
        return params

    if job_type == "optimization":
        from app.domain.optimization import constraints as cons
        from app.domain.optimization import objectives as objs
        from app.services.texture import TextureService

        try:
            cons.parse_constraints(params.get("constraints") or {})
            objective_list = objs.parse_objectives(params.get("objectives") or [])
        except cons.ParamsError as exc:
            raise ApiError(422, "validation_failed", str(exc), {"issues": exc.issues}) from exc
        if not objective_list:
            raise ApiError(
                422,
                "validation_failed",
                "At least one objective is required.",
                _issues(("missing_field", "params.objectives", "Add an objective.")),
            )
        texture_targets = [o.target for o in objective_list if objs.is_texture_target(o.target)]
        if texture_targets:
            TextureService(session, settings).require_models(texture_targets)
            process = params.get("process")
            if not isinstance(process, dict) or process.get("moisture_percent") is None:
                raise ApiError(
                    422,
                    "validation_failed",
                    "Texture objectives need process conditions (moisture_percent).",
                    _issues(
                        (
                            "missing_field",
                            "params.process.moisture_percent",
                            "moisture_percent is required for texture objectives.",
                        )
                    ),
                )
        n = params.get("n_candidates", 5)
        if not isinstance(n, int) or not 1 <= n <= 20:
            raise ApiError(
                422,
                "validation_failed",
                "n_candidates must be 1 to 20.",
                _issues(("out_of_range", "params.n_candidates", "Use 1 to 20.")),
            )
        if params.get("seed") is None:
            params["seed"] = secrets.randbelow(2**31 - 1)
        return params

    raise ApiError(422, "validation_failed", f"Unknown job type {job_type}.")


def create_job(
    session: Session,
    settings: Settings,
    user: CurrentUser,
    *,
    formulation: Formulation | None,
    version: int | None,
    job_type: str,
    params: dict[str, Any],
    idempotency_key: str | None,
    request_id: str | None,
) -> tuple[Job, bool]:
    """Create (or return the idempotent original) job. Returns (job, created)."""
    if idempotency_key:
        existing = session.execute(
            select(Job).where(
                Job.created_by == user.user_id, Job.idempotency_key == idempotency_key
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False
    check_job_limit(session, user, settings)
    seed = params.get("seed")
    job = Job(
        id=new_id("job"),
        formulation_id=formulation.id if formulation else None,
        formulation_version=version,
        type=job_type,
        status="queued",
        params=params,
        created_by=user.user_id,
        seed=int(seed) if seed is not None else None,
        idempotency_key=idempotency_key,
        data_versions={},
        model_ids=[],
    )
    session.add(job)
    audit(
        session,
        actor_id=user.user_id,
        action="job_start",
        entity="job",
        entity_id=job.id,
        payload={"type": job_type, "formulation_id": job.formulation_id, "version": version},
        request_id=request_id,
    )
    session.flush()
    return job, True


def job_status_payload(session: Session, job: Job) -> dict[str, Any]:
    candidate_ids = list(
        session.execute(
            select(Candidate.id).where(Candidate.job_id == job.id).order_by(Candidate.rank)
        ).scalars()
    )
    has_result = (
        session.execute(
            select(func.count()).select_from(JobResult).where(JobResult.job_id == job.id)
        ).scalar_one()
        > 0
    )
    error = None
    if job.error_code:
        error = {
            "code": job.error_code,
            "message": job.error_message,
            "details": job.error_details or {},
        }
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "stage": job.stage,
        "stage_label": job.stage_label,
        "progress_percent": job.progress_percent,
        "message": job.message,
        "cancel_requested": job.cancel_requested_at is not None,
        "formulation_id": job.formulation_id,
        "formulation_version": job.formulation_version,
        "params": job.params,
        "error": error,
        "candidate_ids": candidate_ids,
        "result_available": has_result and job.status == "completed",
        "last_event_seq": job.last_event_seq,
        "created_at": iso(job.created_at),
        "started_at": iso(job.started_at),
        "finished_at": iso(job.finished_at),
        "data_versions": job.data_versions or {},
        "model_ids": job.model_ids or [],
        "calc_version": job.calc_version,
        "seed": job.seed,
    }


def duration_ms(job: Job) -> int | None:
    if job.started_at is None or job.finished_at is None:
        return None
    return int((job.finished_at - job.started_at).total_seconds() * 1000)


def lines_of(version_row: Any) -> list[Line]:
    return [
        Line(ingredient_id=item["ingredient_id"], percent=Decimal(str(item["percent"])))
        for item in version_row.lines
    ]
