from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", ".env.local", "../.env.local"),
        env_prefix="",
        extra="ignore",
    )

    env: Literal["dev", "staging", "prod"] = "dev"

    database_url: str = "postgresql+asyncpg://betterman:betterman@localhost:54320/betterman"
    redis_url: str = "redis://localhost:6379/0"

    public_base_url: str | None = None

    allow_cors_origins: list[str] = []
