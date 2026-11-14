"""Request limits shared across API processes.

Three small pieces of state protect the API: per-key rate limits, single-use stream-token
nonces and the per-user concurrent-stream cap. Held in process memory they are only correct
with one API process. When Redis is configured (``EVENT_BUS=redis`` or ``JOB_RUNNER=celery``)
they live in Redis so every API process sees the same counts. If Redis is unreachable the
in-memory implementation is used for that call, so a Redis outage degrades the limits to
per-process instead of failing requests.
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Any, Protocol

from app.config import get_settings

logger = logging.getLogger("app.limits")
STREAM_SLOT_TTL_SECONDS = 6 * 3600  # safety expiry if a process dies holding stream slots


class Limits(Protocol):
    def allow(self, key: str, limit: int, window_seconds: float) -> bool: ...

    def consume_nonce(self, nonce: str, expires_at: int) -> bool: ...

    def acquire_stream(self, user_id: str, limit: int) -> bool: ...

    def release_stream(self, user_id: str) -> None: ...

    def reset(self) -> None: ...


class MemoryLimits:
    """Per-process limits (development, tests, single-process deployments)."""

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        from app.core.observability import rate_limiter

        return rate_limiter.allow(key, limit, window_seconds)

    def consume_nonce(self, nonce: str, expires_at: int) -> bool:
        from app.core.security import stream_nonces

        return stream_nonces.consume(nonce, expires_at)

    def acquire_stream(self, user_id: str, limit: int) -> bool:
        from app.api.sse import stream_limiter

        return stream_limiter.acquire(user_id, limit)

    def release_stream(self, user_id: str) -> None:
        from app.api.sse import stream_limiter

        stream_limiter.release(user_id)

    def reset(self) -> None:
        from app.core.observability import rate_limiter

        rate_limiter.reset()


class RedisLimits:
    """Limits stored in Redis; falls back to memory for a call if Redis fails."""

    def __init__(self, client: Any, prefix: str = "vpmf:limits") -> None:
        self._redis = client
        self._prefix = prefix
        self._fallback = MemoryLimits()

    def _warn(self, operation: str, exc: Exception) -> None:
        logger.warning("redis limits unavailable for %s: %s", operation, type(exc).__name__)

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        window = max(1, int(window_seconds))
        bucket = f"{self._prefix}:rate:{key}:{int(time.time()) // window}"
        try:
            count = int(self._redis.incr(bucket))
            if count == 1:
                self._redis.expire(bucket, window * 2)
            return count <= limit
        except Exception as exc:  # noqa: BLE001 - degrade to per-process limits
            self._warn("rate limit", exc)
            return self._fallback.allow(key, limit, window_seconds)

    def consume_nonce(self, nonce: str, expires_at: int) -> bool:
        ttl = max(1, int(expires_at - time.time()) + 5)
        try:
            return bool(self._redis.set(f"{self._prefix}:nonce:{nonce}", "1", nx=True, ex=ttl))
        except Exception as exc:  # noqa: BLE001
            self._warn("stream nonce", exc)
            return self._fallback.consume_nonce(nonce, expires_at)

    def acquire_stream(self, user_id: str, limit: int) -> bool:
        key = f"{self._prefix}:streams:{user_id}"
        try:
            count = int(self._redis.incr(key))
            self._redis.expire(key, STREAM_SLOT_TTL_SECONDS)
            if count > limit:
                self._redis.decr(key)
                return False
            return True
        except Exception as exc:  # noqa: BLE001
            self._warn("stream slot", exc)
            return self._fallback.acquire_stream(user_id, limit)

    def release_stream(self, user_id: str) -> None:
        key = f"{self._prefix}:streams:{user_id}"
        try:
            if int(self._redis.decr(key)) < 0:
                self._redis.set(key, 0, ex=STREAM_SLOT_TTL_SECONDS)
        except Exception as exc:  # noqa: BLE001
            self._warn("stream slot release", exc)
            self._fallback.release_stream(user_id)

    def reset(self) -> None:
        self._fallback.reset()


@lru_cache
def get_limits() -> Limits:
    settings = get_settings()
    if settings.event_bus == "redis" or settings.job_runner == "celery":
        from redis import Redis

        return RedisLimits(
            Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
        )
    return MemoryLimits()
