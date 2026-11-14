"""Server-Sent Events helpers: wire formatting, replay from job_events, live relay.

The API never generates synthetic job events; the only non-job traffic is the
``: heartbeat`` comment every ``sse_heartbeat_seconds``.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections import defaultdict
from collections.abc import AsyncIterator, Callable
from typing import Any

from sqlalchemy import select

from app.db.models import JobEvent
from app.db.session import SessionLocal
from app.jobs.events import TERMINAL_EVENTS, EventBus

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def format_event(payload: dict[str, Any]) -> str:
    data = json.dumps(payload, separators=(",", ":"), default=str)
    return f"id: {payload['seq']}\nevent: {payload['event']}\ndata: {data}\n\n"


def load_events_after(job_id: str, after_seq: int) -> list[dict[str, Any]]:
    session = SessionLocal()
    try:
        rows = session.execute(
            select(JobEvent)
            .where(JobEvent.job_id == job_id, JobEvent.seq > after_seq)
            .order_by(JobEvent.seq)
        ).scalars()
        return [dict(row.payload) for row in rows]
    finally:
        session.close()


class StreamLimiter:
    """At most N concurrent streams per user (per API process)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: dict[str, int] = defaultdict(int)

    def acquire(self, user_id: str, limit: int) -> bool:
        with self._lock:
            if self._counts[user_id] >= limit:
                return False
            self._counts[user_id] += 1
            return True

    def release(self, user_id: str) -> None:
        with self._lock:
            self._counts[user_id] = max(0, self._counts[user_id] - 1)


stream_limiter = StreamLimiter()


async def job_event_stream(
    job_id: str,
    after_seq: int,
    bus: EventBus,
    *,
    heartbeat_seconds: float,
    is_disconnected: Callable[[], Any],
    on_close: Callable[[], None],
    poll_seconds: float = 1.0,
) -> AsyncIterator[str]:
    """Replay stored events after ``after_seq``, then relay live ones until terminal."""
    last = after_seq
    last_sent = time.monotonic()
    try:
        while True:
            events = await asyncio.to_thread(load_events_after, job_id, last)
            for payload in events:
                yield format_event(payload)
                last = int(payload["seq"])
                last_sent = time.monotonic()
                if payload["event"] in TERMINAL_EVENTS:
                    return
            if await is_disconnected():
                return
            woke = await asyncio.to_thread(bus.wait, job_id, last, poll_seconds)
            if not woke and time.monotonic() - last_sent >= heartbeat_seconds:
                yield ": heartbeat\n\n"
                last_sent = time.monotonic()
    finally:
        on_close()
