"""Environment-backed application settings and production secret checks."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    redis_url: str = "redis://localhost:6379/0"
    job_runner: Literal["inline", "celery"] = "inline"
    event_bus: Literal["memory", "redis"] = "memory"
    cors_allowed_origins: list[str] = ["http://localhost:3000"]
    stream_token_secret: str = "dev-only-change-me"
    stream_token_ttl_seconds: int = 60
    git_sha: str = "dev"
    log_level: str = "INFO"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        """Accept either comma-separated environment values or a list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def require_real_production_secret(self) -> Settings:
        """Refuse known development placeholders in production."""
        secret = self.stream_token_secret.strip().lower()
        placeholder_values = {"", "dev-only-change-me", "changeme", "change-me", "placeholder"}
        is_placeholder = (
            secret in placeholder_values
            or secret.startswith("dev-only-")
            or "placeholder" in secret
            or "change-me" in secret
            or "changeme" in secret
        )
        if self.env.lower() == "production" and is_placeholder:
            raise ValueError(
                "STREAM_TOKEN_SECRET must be set to a non-placeholder value in production"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings object."""
    return Settings()
