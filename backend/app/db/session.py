"""Database engine, session factory and the FastAPI session dependency."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings


def build_engine(url: str) -> Engine:
    """Create an engine; in-memory SQLite (tests) shares one connection across threads."""
    if url.startswith("sqlite"):
        kwargs: dict[str, object] = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url.rstrip("/") in ("sqlite:", "sqlite"):
            kwargs["poolclass"] = StaticPool
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _fk_pragma(dbapi_connection, _record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    settings = get_settings()
    kwargs: dict[str, object] = {
        "pool_pre_ping": True,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        # Return connections to the pooler instead of holding them for the
        # life of the process, so an idle API does not occupy client slots.
        "pool_recycle": settings.db_pool_recycle_seconds,
    }
    if _is_transaction_pooler(url):
        # Supabase's transaction-mode pooler (port 6543) multiplexes many
        # clients onto few server connections, which is what lets the API and
        # worker share a small pool. It cannot carry server-side prepared
        # statements across transactions, so psycopg must stop making them:
        # without this, queries fail with "prepared statement does not exist".
        kwargs["connect_args"] = {"prepare_threshold": None}
    return create_engine(url, **kwargs)


# Supabase exposes session mode on 5432 (one server connection per client,
# capped at pool_size: 15) and transaction mode on 6543.
TRANSACTION_POOLER_PORT = ":6543"


def _is_transaction_pooler(url: str) -> bool:
    return TRANSACTION_POOLER_PORT in url


@lru_cache
def get_engine() -> Engine:
    return build_engine(get_settings().database_url)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)


def SessionLocal() -> Session:  # noqa: N802 - conventional factory name
    return get_sessionmaker()()


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, rolled back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
