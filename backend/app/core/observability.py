"""Structured JSON logging, Prometheus-style metrics and simple per-key rate limiting."""

from __future__ import annotations

import json
import logging
import sys
import threading
import time
from collections import defaultdict, deque
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_var: ContextVar[str | None] = ContextVar("user_id", default=None)

_SENSITIVE = ("authorization", "token", "password", "api_key", "secret")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if rid := request_id_var.get():
            payload["request_id"] = rid
        if uid := user_id_var.get():
            payload["user_id"] = uid
        for key in ("job_id", "calc_version", "path", "method", "status", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        text = json.dumps(payload, default=str)
        for word in _SENSITIVE:
            if f'"{word}' in text.lower():
                payload["message"] = "[redacted]"
                text = json.dumps(payload, default=str)
                break
        return text


def configure_logging(level: str) -> None:
    root = logging.getLogger()
    if any(isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        root.setLevel(level.upper())
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(level.upper())


class Metrics:
    """Minimal thread-safe counters and summaries rendered in Prometheus text format."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._sums: dict[tuple[str, tuple[tuple[str, str], ...]], list[float]] = defaultdict(
            lambda: [0.0, 0.0]
        )
        self._gauges: dict[str, float] = {}

    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        with self._lock:
            self._counters[(name, tuple(sorted(labels.items())))] += value

    def observe(self, name: str, value: float, **labels: str) -> None:
        with self._lock:
            entry = self._sums[(name, tuple(sorted(labels.items())))]
            entry[0] += value
            entry[1] += 1

    def gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = value

    def render(self) -> str:
        def fmt(labels: tuple[tuple[str, str], ...]) -> str:
            if not labels:
                return ""
            inner = ",".join(f'{k}="{v}"' for k, v in labels)
            return "{" + inner + "}"

        lines: list[str] = []
        with self._lock:
            for (name, labels), value in sorted(self._counters.items()):
                lines.append(f"{name}{fmt(labels)} {value}")
            for (name, labels), (total, count) in sorted(self._sums.items()):
                lines.append(f"{name}_sum{fmt(labels)} {total}")
                lines.append(f"{name}_count{fmt(labels)} {count}")
            for name, value in sorted(self._gauges.items()):
                lines.append(f"{name} {value}")
        return "\n".join(lines) + "\n"


metrics = Metrics()


class RateLimiter:
    """Sliding-window limiter per key (per API process)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = RateLimiter()

# (method, path suffix matcher) -> (limit, window seconds)
RATE_LIMITS: list[tuple[str, str, int, float]] = [
    ("POST", "/api/auth/login", 10, 60.0),
    ("POST", "/jobs", 30, 60.0),
    ("GET", "/export", 20, 60.0),
    ("POST", "/stream-token", 60, 60.0),
    ("POST", "/explain", 20, 60.0),
]


def rate_limit_rule(method: str, path: str) -> tuple[str, int, float] | None:
    for rule_method, suffix, limit, window in RATE_LIMITS:
        if method == rule_method and (path.endswith(suffix) or suffix in path):
            return suffix, limit, window
    return None
