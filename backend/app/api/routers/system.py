"""System health endpoint and dependency availability checks."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import create_engine, text

from app.api.errors import ApiError
from app.config import Settings, get_settings

router = APIRouter(tags=["system"])


def _check_database(database_url: str) -> None:
    """Open a short-lived connection and issue a minimal database query."""
    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    finally:
        engine.dispose()


def _check_redis(redis_url: str) -> None:
    """Ping Redis when the configured runner or event bus depends on it."""
    from redis import Redis

    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        client.ping()
    finally:
        client.close()


def check_dependencies(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """Raise a typed 503 when a required backing service is unavailable."""
    try:
        _check_database(settings.database_url)
        if settings.event_bus == "redis" or settings.job_runner == "celery":
            _check_redis(settings.redis_url)
    except Exception as exc:
        raise ApiError(
            503,
            "dependency_unavailable",
            "A required service is unavailable.",
            {"dependency": "database_or_redis"},
        ) from exc


@router.get("/health")
def health(
    _dependencies: Annotated[None, Depends(check_dependencies)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    """Report API version after checking its configured dependencies."""
    return {"status": "ok", "version": settings.git_sha}
