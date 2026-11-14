"""Redis Streams event bus: one stream ``job:{job_id}:events`` per job.

Workers XADD after the database write; the API blocks on XREAD. Streams expire 24 hours
after the terminal event; PostgreSQL remains the permanent record.
"""

import json
from typing import Any

from redis import Redis

TERMINAL = {"job.completed", "job.failed", "job.cancelled"}
STREAM_TTL_SECONDS = 24 * 3600


def stream_key(job_id: str) -> str:
    return f"job:{job_id}:events"


class RedisBus:
    def __init__(self, url: str) -> None:
        self._redis: Any = Redis.from_url(url, socket_connect_timeout=3)

    def publish(self, job_id: str, seq: int, payload: dict[str, Any]) -> None:
        key = stream_key(job_id)
        self._redis.xadd(key, {"seq": seq, "data": json.dumps(payload)})
        if payload.get("event") in TERMINAL:
            self._redis.expire(key, STREAM_TTL_SECONDS)

    def wait(self, job_id: str, after_seq: int, timeout: float) -> bool:
        key = stream_key(job_id)
        # Fast path: the latest entry already has a newer seq.
        latest = self._redis.xrevrange(key, count=1)
        if latest and int(latest[0][1][b"seq"]) > after_seq:
            return True
        last_id = latest[0][0] if latest else "0-0"
        result = self._redis.xread({key: last_id}, block=max(1, int(timeout * 1000)), count=1)
        return bool(result)
