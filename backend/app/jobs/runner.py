"""Job runners: InlineRunner (thread in the API process) and CeleryRunner (workers).

Both execute ``execute_job`` with the same code path, event schema and ``jobs`` table,
so moving a job type to Celery is a configuration change.
"""

from __future__ import annotations

import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Protocol

from app.config import get_settings
from app.db.models import Job
from app.db.session import SessionLocal
from app.jobs.events import (
    EventAfterTerminalError,
    EventBus,
    JobCancelledSignal,
    JobEmitter,
    JobFailure,
)

logger = logging.getLogger("app.jobs")


@lru_cache
def get_bus() -> EventBus:
    settings = get_settings()
    if settings.event_bus == "redis":
        from app.jobs.bus_redis import RedisBus

        return RedisBus(settings.redis_url)
    from app.jobs.bus_memory import MemoryBus

    return MemoryBus()


def make_emitter(job_id: str) -> JobEmitter:
    return JobEmitter(job_id, SessionLocal, get_bus())


def execute_job(job_id: str) -> None:
    """Run one job to a terminal event. Never raises for job-level failures."""
    from app.jobs.tasks import HANDLERS

    emitter = make_emitter(job_id)
    session = SessionLocal()
    try:
        job = session.get(Job, job_id)
        if job is None:
            logger.error("job %s not found", job_id)
            return
        if job.status != "queued":
            logger.warning("job %s already %s; skipping", job_id, job.status)
            return
        job_type = job.type
    finally:
        session.close()

    handler = HANDLERS.get(job_type)
    import time

    from app.core.observability import metrics

    started = time.perf_counter()
    outcome = "completed"
    try:
        if handler is None:
            raise JobFailure("bad_request", f"Unknown job type {job_type}.")
        if emitter.cancel_requested():
            raise JobCancelledSignal()
        handler(job_id, emitter)
    except JobCancelledSignal:
        outcome = "cancelled"
        _terminal(emitter.cancelled, job_id)
    except JobFailure as failure:
        outcome = f"failed:{failure.code}"
        code, message, details = failure.code, failure.message, failure.details
        _terminal(lambda: emitter.failed(code, message, details), job_id)
    except EventAfterTerminalError:
        outcome = "event_after_terminal"
        logger.exception("job %s attempted to emit after terminal", job_id)
    except Exception as exc:  # noqa: BLE001 - convert to a typed failure event
        outcome = "failed:internal_error"
        logger.error(
            "job %s crashed: %s\n%s",
            job_id,
            exc,
            traceback.format_exc(),
            extra={"job_id": job_id},
        )
        _terminal(lambda: emitter.failed("internal_error", "The job failed unexpectedly."), job_id)
    finally:
        elapsed = (time.perf_counter() - started) * 1000
        metrics.observe("job_duration_ms", elapsed, type=job_type)
        metrics.inc("job_outcomes_total", type=job_type, outcome=outcome)
        logger.info(
            "job finished",
            extra={"job_id": job_id, "status": outcome, "duration_ms": round(elapsed, 1)},
        )


def _terminal(fn, job_id: str) -> None:  # type: ignore[no-untyped-def]
    try:
        fn()
    except EventAfterTerminalError:
        logger.warning("job %s already terminal", job_id)


class Runner(Protocol):
    def submit(self, job_id: str) -> None: ...


class InlineRunner:
    """Runs jobs in a small thread pool inside the API process (dev, fast jobs).

    With ENV=test, jobs run synchronously so tests are deterministic.
    """

    def __init__(self, max_workers: int = 4, synchronous: bool = False) -> None:
        self._synchronous = synchronous
        self._pool = (
            None
            if synchronous
            else ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="job")
        )

    def submit(self, job_id: str) -> None:
        if self._pool is None:
            execute_job(job_id)
        else:
            self._pool.submit(execute_job, job_id)


class CeleryRunner:
    def submit(self, job_id: str) -> None:
        from app.jobs.celery_app import execute_job_task

        execute_job_task.delay(job_id)


@lru_cache
def get_runner() -> Runner:
    settings = get_settings()
    if settings.job_runner == "celery":
        return CeleryRunner()
    return InlineRunner(synchronous=settings.is_test)
