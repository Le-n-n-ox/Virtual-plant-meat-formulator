"""Environment-backed application settings and production secret checks."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Settings shared by the API, migrations, and worker process."""

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        enable_decoding=False,
        extra="ignore",
        case_sensitive=False,
    )

    env: str = "development"
    database_url: str = (
        "postgresql+psycopg://postgres:devpassword@localhost:5432/virtual_plant_meat_formulator"
    )

    # Connection pool. These defaults are deliberately small: a hosted pooler
    # caps how many clients may connect at once (Supabase's session mode allows
    # 15), and every process that opens an engine — the API and each worker —
    # spends from that one budget. The previous values (10 + 20 overflow) let a
    # single process ask for 30, which exhausted the pooler and left migrations
    # unable to connect at all.
    db_pool_size: int = 3
    db_max_overflow: int = 2
    db_pool_recycle_seconds: int = 300

    # Migrations run against this URL when set, otherwise `database_url`.
    # Alembic needs a real session: it holds DDL in one transaction and locks
    # its version table, which a transaction-mode pooler does not guarantee to
    # keep on one server connection. So the app can use transaction mode (port
    # 6543) while migrations keep using session mode (5432). It only ever needs
    # one connection, briefly, and already uses NullPool.
    migrate_database_url: str | None = None

    redis_url: str = "redis://localhost:6379/0"
    job_runner: Literal["inline", "celery"] = "inline"
    event_bus: Literal["memory", "redis"] = "memory"
    cors_allowed_origins: list[str] = ["http://localhost:3000"]
    stream_token_secret: str = "dev-only-change-me"
    stream_token_ttl_seconds: int = 60
    git_sha: str = "dev"
    log_level: str = "INFO"

    # Authentication. "supabase" verifies Supabase-issued JWTs via the project's
    # published signing keys; "local" issues and verifies HS256 tokens itself
    # (development and self-hosted prototype only).
    auth_mode: Literal["local", "supabase"] = "local"
    supabase_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_secret: str | None = None
    local_jwt_secret: str = "dev-only-local-jwt-secret-not-for-production"
    local_jwt_ttl_seconds: int = 3600
    local_jwt_audience: str = "vpmf-local"

    # Jobs and limits
    max_active_jobs_per_user: int = 5
    # A running job with no event for this long, or a queued job never picked up, is
    # marked failed so it stops counting against the user's active-job limit.
    job_stale_seconds: int = 900
    job_queue_timeout_seconds: int = 3600
    max_streams_per_user: int = 5
    sse_heartbeat_seconds: float = 15.0
    max_request_bytes: int = 5_000_000

    # Model governance
    min_training_samples: int = 30
    model_artifact_dir: str = str(BACKEND_ROOT / "artifacts" / "models")
    export_dir: str = str(BACKEND_ROOT / "artifacts" / "exports")
    data_dir: str = str(BACKEND_ROOT / "data")
    mlflow_tracking_uri: str | None = None
    artifact_store_url: str | None = None

    # NVIDIA hosted language model: used only to narrate stored results and
    # evidence. It never produces a scientific value.
    nvidia_api_key: str | None = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str | None = None
    nvidia_timeout_seconds: float = 60.0
    nvidia_max_tokens: int = 4096

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        """Accept either comma-separated environment values or a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @staticmethod
    def _is_placeholder(value: str) -> bool:
        secret = value.strip().lower()
        placeholder_values = {"", "dev-only-change-me", "changeme", "change-me", "placeholder"}
        return (
            secret in placeholder_values
            or secret.startswith("dev-only-")
            or "placeholder" in secret
            or "change-me" in secret
            or "changeme" in secret
        )

    @model_validator(mode="after")
    def require_real_production_secret(self) -> Settings:
        """Refuse known development placeholders in production."""
        if self.env.lower() == "production":
            if self._is_placeholder(self.stream_token_secret):
                raise ValueError(
                    "STREAM_TOKEN_SECRET must be set to a non-placeholder value in production"
                )
            if self.auth_mode == "local" and self._is_placeholder(self.local_jwt_secret):
                raise ValueError(
                    "LOCAL_JWT_SECRET must be set to a non-placeholder value in production"
                )
        return self

    @property
    def is_test(self) -> bool:
        return self.env.lower() == "test"

    @property
    def nvidia_configured(self) -> bool:
        key = (self.nvidia_api_key or "").strip()
        model = (self.nvidia_model or "").strip()
        return bool(key) and "REPLACE" not in key and bool(model) and "REPLACE" not in model


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings object."""
    return Settings()
