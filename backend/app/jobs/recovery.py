"""Recovery for jobs whose worker died: mark them failed so they stop blocking the user.

A job is stale when it is ``running`` with no event for ``job_stale_seconds`` (the worker
or API process was killed mid-job) or ``queued`` for longer than
``job_queue_timeout_seconds`` (it was never picked up). Recovery emits a normal
``job.failed`` event, so streams, status and the active-job limit all stay consistent. If
the original worker is in fact still alive, its next event is refused (nothing may follow
a terminal event) and it stops.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.config import Settings
from app.db.models import Job, JobEvent
from app.db.session import SessionLocal
from app.jobs.events import EventAfterTerminalError

logger = logging.getLogger("app.jobs")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def find_stale_jobs(
    settings: Settings,
    *,
    user_id: str | None = None,
    job_id: str | None = None,
    now: datetime | None = None,
) -> list[tuple[str, str]]:
    """Return ``(job_id, reason)`` for stale active jobs (reason: worker_lost | never_started)."""
    now = now or datetime.now(UTC)
    session = SessionLocal()
    try:
        stmt = (
            select(Job, func.max(JobEvent.created_at))
            .outerjoin(JobEvent, JobEvent.job_id == Job.id)
            .where(Job.status.in_(("queued", "running")))
            .group_by(Job.id)
        )
        if user_id is not None:
            stmt = stmt.where(Job.created_by == user_id)
        if job_id is not None:
            stmt = stmt.where(Job.id == job_id)
        stale: list[tuple[str, str]] = []
        for job, last_event in session.execute(stmt).all():
            if job.status == "running":
                last = _aware(last_event or job.started_at or job.created_at)
                if (now - last).total_seconds() > settings.job_stale_seconds:
                    stale.append((job.id, "worker_lost"))
            elif (now - _aware(job.created_at)).total_seconds() > (
                settings.job_queue_timeout_seconds
            ):
                stale.append((job.id, "never_started"))
        return stale
    finally:
        session.close()


def fail_stale_jobs(
    settings: Settings,
    *,
    user_id: str | None = None,
    job_id: str | None = None,
    now: datetime | None = None,
) -> list[str]:
    """Fail every stale job in scope; return the ids that were failed."""
    from app.jobs.runner import make_emitter

    failed: list[str] = []
    for stale_id, reason in find_stale_jobs(settings, user_id=user_id, job_id=job_id, now=now):
        message = (
            "The worker stopped before this job finished. Start the job again."
            if reason == "worker_lost"
            else "This job was never picked up by a worker. Start the job again."
        )
        try:
            make_emitter(stale_id).failed("internal_error", message, {"reason": reason})
        except EventAfterTerminalError:
            continue  # finished in the meantime
        logger.warning("recovered stale job %s (%s)", stale_id, reason, extra={"job_id": stale_id})
        failed.append(stale_id)
    return failed
