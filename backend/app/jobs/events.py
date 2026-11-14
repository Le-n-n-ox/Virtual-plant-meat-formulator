"""Job event schema, the EventBus interface and the worker-side JobEmitter.

Integrity rules (guide section 7):
1. progress_percent is null unless the worker holds a real completed/total; computed as
   floor(100*completed/total) and never decreasing within a stage.
2. Events are written to job_events before they are published.
3. seq is gapless per job; nothing may follow a terminal event.
4. Timestamps come from the worker clock in UTC.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ids import iso, utcnow
from app.db.models import Job, JobEvent

EVENT_NAMES = (
    "stage.updated",
    "progress.updated",
    "warning.raised",
    "candidate.ready",
    "result.ready",
    "job.completed",
    "job.failed",
    "job.cancelled",
)
TERMINAL_EVENTS = {
    "job.completed": "completed",
    "job.failed": "failed",
    "job.cancelled": "cancelled",
}
TERMINAL_STATUSES = frozenset(TERMINAL_EVENTS.values())

STAGES: dict[str, list[tuple[str, str]]] = {
    "nutrition": [
        ("validating", "Validating formulation"),
        ("loading_ingredients", "Loading ingredient data"),
        ("calculating", "Calculating nutrition"),
        ("scoring_amino_acids", "Scoring amino acids"),
        ("storing", "Storing result"),
    ],
    "texture_prediction": [
        ("validating", "Validating formulation"),
        ("building_features", "Building model features"),
        ("checking_domain", "Checking applicability domain"),
        ("predicting", "Predicting texture"),
        ("storing", "Storing result"),
    ],
    "optimization": [
        ("validating", "Validating formulation"),
        ("preparing_constraints", "Preparing constraints"),
        ("searching", "Searching formulations"),
        ("ranking", "Ranking candidates"),
        ("storing", "Storing candidates"),
    ],
    "model_training": [
        ("loading_dataset", "Loading dataset"),
        ("cross_validating", "Cross-validating candidate models"),
        ("fitting", "Fitting final model"),
        ("evaluating", "Evaluating model"),
        ("registering", "Registering model"),
    ],
}


def stage_label(job_type: str, stage: str) -> str:
    return dict(STAGES.get(job_type, [])).get(stage, stage.replace("_", " ").capitalize())


class EventBus(Protocol):
    """Delivers a wake-up (and the event) to SSE streams. PostgreSQL stays the record."""

    def publish(self, job_id: str, seq: int, payload: dict[str, Any]) -> None: ...

    def wait(self, job_id: str, after_seq: int, timeout: float) -> bool:
        """Block up to ``timeout`` seconds; True if an event with seq > after_seq may exist."""
        ...


class EventAfterTerminalError(RuntimeError):
    """Raised when code tries to append an event after a terminal one."""


class JobCancelledSignal(Exception):
    """Raised by tasks at a safe point after a cancel request."""


class JobFailure(Exception):
    """A typed, expected job failure (becomes job.failed with details.code)."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


def event_payload(row: JobEvent) -> dict[str, Any]:
    return dict(row.payload)


class JobEmitter:
    """Writes events for one job: DB first (gapless seq, row lock), then the bus."""

    def __init__(
        self,
        job_id: str,
        session_factory: Callable[[], Session],
        bus: EventBus,
    ) -> None:
        self.job_id = job_id
        self._session_factory = session_factory
        self._bus = bus
        self._stage_progress: dict[str, int] = {}

    # ----------------------------------------------------------------- core append
    def _append(
        self,
        event: str,
        *,
        stage: str | None = None,
        progress: tuple[int, int] | None = None,
        message: str | None = None,
        candidate_id: str | None = None,
        details: dict[str, Any] | None = None,
        job_updates: Callable[[Job], None] | None = None,
    ) -> dict[str, Any]:
        if event not in EVENT_NAMES:
            raise ValueError(f"Unknown event {event}")
        session = self._session_factory()
        try:
            stmt = select(Job).where(Job.id == self.job_id)
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                stmt = stmt.with_for_update()
            job = session.execute(stmt).scalar_one()
            if job.status in TERMINAL_STATUSES:
                raise EventAfterTerminalError(
                    f"Job {self.job_id} is {job.status}; refusing to append {event}"
                )
            now = utcnow()
            if job.status == "queued":
                job.status = "running"
                job.started_at = job.started_at or now
            if stage is not None:
                job.stage = stage
                job.stage_label = stage_label(job.type, stage)
                job.progress_percent = None
            percent: int | None = None
            completed = total = None
            if progress is not None:
                completed, total = progress
                if total <= 0 or completed < 0 or completed > total:
                    raise ValueError("progress requires 0 <= completed <= total and total > 0")
                percent = (100 * completed) // total
                key = job.stage or ""
                percent = max(percent, self._stage_progress.get(key, 0))
                self._stage_progress[key] = percent
                job.progress_percent = percent
            if message is not None and event in ("stage.updated", "progress.updated"):
                job.message = message
            if event in TERMINAL_EVENTS:
                job.status = TERMINAL_EVENTS[event]
                job.finished_at = now
            if job_updates is not None:
                job_updates(job)
            seq = job.last_event_seq + 1
            job.last_event_seq = seq
            payload: dict[str, Any] = {
                "job_id": job.id,
                "seq": seq,
                "event": event,
                "status": job.status,
                "stage": job.stage or "",
                "stage_label": job.stage_label or "",
                "progress_percent": percent
                if event == "progress.updated"
                else (job.progress_percent if event == "stage.updated" else None),
                "message": message,
                "candidate_id": candidate_id,
                "timestamp": iso(now),
            }
            if progress is not None:
                payload["progress_percent"] = percent
                payload["completed"] = completed
                payload["total"] = total
            if details:
                payload["details"] = details
            session.add(JobEvent(job_id=job.id, seq=seq, event=event, payload=payload))
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
        self._bus.publish(self.job_id, seq, payload)
        return payload

    # ----------------------------------------------------------------- helpers
    def stage(self, stage: str, message: str | None = None) -> dict[str, Any]:
        self._stage_progress.pop(stage, None)
        return self._append("stage.updated", stage=stage, message=message)

    def progress(self, completed: int, total: int, message: str | None = None) -> dict[str, Any]:
        return self._append("progress.updated", progress=(completed, total), message=message)

    def warning(
        self, message: str, code: str, details: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self._append(
            "warning.raised", message=message, details={"code": code, **(details or {})}
        )

    def candidate_ready(self, candidate_id: str, message: str | None = None) -> dict[str, Any]:
        return self._append("candidate.ready", candidate_id=candidate_id, message=message)

    def result_ready(self) -> dict[str, Any]:
        return self._append("result.ready", message="Result stored")

    def completed(self, message: str = "Job completed") -> dict[str, Any]:
        return self._append("job.completed", message=message)

    def failed(
        self, code: str, message: str, details: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        def update(job: Job) -> None:
            job.error_code = code
            job.error_message = message
            job.error_details = details or {}

        return self._append(
            "job.failed",
            message=message,
            details={"code": code, **(details or {})},
            job_updates=update,
        )

    def cancelled(self, message: str = "Job cancelled") -> dict[str, Any]:
        return self._append("job.cancelled", message=message)

    # ----------------------------------------------------------------- state reads
    def cancel_requested(self) -> bool:
        session = self._session_factory()
        try:
            job = session.get(Job, self.job_id)
            return bool(job and job.cancel_requested_at is not None)
        finally:
            session.close()

    def check_cancel(self) -> None:
        if self.cancel_requested():
            raise JobCancelledSignal()
