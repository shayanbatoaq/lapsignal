from __future__ import annotations

import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import REPO_ROOT, get_settings

APPLICATION_VERSION = "0.1.0-alpha.4"
BUILD_NUMBER = 4
DIAGNOSTICS_CONTRACT_VERSION = "3"
CLOUD_AI_GUARD_ACTIVE = True
PROCESS_START_TIME = datetime.now(UTC).isoformat()


def _git_commit(repo_root: Path = REPO_ROOT) -> str:
    managed = os.getenv("LAPSIGNAL_GIT_COMMIT")
    if managed:
        return managed
    try:
        dirty = subprocess.run(
            ["git", "-C", str(repo_root), "diff-index", "--quiet", "HEAD", "--"],
            check=False,
            capture_output=True,
            timeout=2,
        )
        if dirty.returncode != 0:
            return "uncommitted"
        commit = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--short=12", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
        return commit or "uncommitted"
    except (OSError, subprocess.SubprocessError):
        return "uncommitted"


def api_build_identity(*, cloud_ai_enabled: bool, schema_hash: str) -> dict[str, Any]:
    settings = get_settings()
    provider_configured = (
        bool(settings.openrouter_api_key and settings.openrouter_coach_model)
        if settings.ai_provider == "openrouter"
        else bool(settings.openai_api_key and settings.openai_coach_model)
        if settings.ai_provider == "openai"
        else settings.ai_provider == "rule_based"
    )
    return {
        "component": "api",
        "application_version": APPLICATION_VERSION,
        "build_number": BUILD_NUMBER,
        "git_commit": _git_commit(),
        "process_id": os.getpid(),
        "process_start_time": os.getenv("LAPSIGNAL_PROCESS_START_TIME", PROCESS_START_TIME),
        "ai_provider": settings.ai_provider,
        "ai_provider_configured": provider_configured,
        "ai_endpoint_family": "direct_openai",
        "cloud_ai_enabled": cloud_ai_enabled,
        "cloud_ai_guard_active": CLOUD_AI_GUARD_ACTIVE,
        "ai_contract_schema_hash": schema_hash,
        "diagnostics_contract_version": DIAGNOSTICS_CONTRACT_VERSION,
    }
