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
    demo_mode: bool = True
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
    git_sha: str = "local"
    build_number: int = 3

    @field_validator("data_dir")
    @classmethod
    def normalize_data_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else (REPO_ROOT / value).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
