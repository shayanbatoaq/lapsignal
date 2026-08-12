from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: str = "development"
    database_url: str = f"sqlite:///{(REPO_ROOT / 'data/local/lapsignal.db').as_posix()}"
    data_dir: Path = REPO_ROOT / "data"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    max_request_bytes: int = 2_000_000
    openai_api_key: str | None = None
    openai_coach_model: str = "gpt-5.6-luna"
    openai_deep_model: str = "gpt-5.6-terra"
    ai_provider: str = "openrouter"
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_coach_model: str = "openai/gpt-5-mini"
    openrouter_deep_model: str = "openai/gpt-5.2"
    openrouter_app_url: str = "http://localhost:3000"
    openrouter_app_title: str = "LapSignal"
    openrouter_data_collection: str = "deny"
    openrouter_zdr: bool = False
    ai_request_timeout_seconds: float = 30
    ai_max_retries: int = 0
    ai_cache_enabled: bool = True
    ai_live_lap_coaching: bool = False
    live_session_inactivity_seconds: int = 30
    git_sha: str = "local"
    build_number: int = 4

    @field_validator("data_dir")
    @classmethod
    def normalize_data_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
