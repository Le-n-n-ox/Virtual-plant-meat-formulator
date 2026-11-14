"""In-process event bus for development and tests (same interface as RedisBus)."""

import threading
from typing import Any


class MemoryBus:
    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._latest: dict[str, int] = {}

    def publish(self, job_id: str, seq: int, payload: dict[str, Any]) -> None:
        with self._cond:
            self._latest[job_id] = max(seq, self._latest.get(job_id, 0))
            self._cond.notify_all()

    def wait(self, job_id: str, after_seq: int, timeout: float) -> bool:
        with self._cond:
            return self._cond.wait_for(
                lambda: self._latest.get(job_id, 0) > after_seq, timeout=timeout
            )
