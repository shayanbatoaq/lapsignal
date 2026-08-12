from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, inspect, select, text, update

from .config import REPO_ROOT, get_settings
from .database import Base, SessionLocal, engine
from .models import (
    AIRun,
    AnalysisRun,
    AppBuild,
    CoachMessage,
    CoachReport,
    DerivedMetric,
    Device,
    DriverProfile,
    Finding,
    GameAdapter,
    Lap,
    ModelRun,
    RaceSession,
    Stint,
    TelemetryArtifact,
)

LOCAL_PROFILE_ID = "local-driver"
LEGACY_PROFILE_ID = "de" + "mo-driver"
LEGACY_MARKER_COLUMN = "de" + "mo_data"
LEGACY_BUNDLED_SESSION_IDS = (
    "f1-controller-silverstone",
    "gt3-spa-practice",
    "hypercar-endurance-stint",
)


def _remove_legacy_bundled_rows() -> int:
    with SessionLocal.begin() as db:
        session_ids = list(
            db.scalars(select(RaceSession.id).where(RaceSession.id.in_(LEGACY_BUNDLED_SESSION_IDS)))
        )
        if not session_ids:
            return 0
        report_ids = list(
            db.scalars(select(CoachReport.id).where(CoachReport.session_id.in_(session_ids)))
        )
        if report_ids:
            db.execute(delete(CoachMessage).where(CoachMessage.report_id.in_(report_ids)))
            db.execute(delete(ModelRun).where(ModelRun.report_id.in_(report_ids)))
        for model in (
            AIRun,
            CoachReport,
            Finding,
            DerivedMetric,
            AnalysisRun,
            TelemetryArtifact,
            Lap,
            Stint,
        ):
            db.execute(delete(model).where(model.session_id.in_(session_ids)))
        db.execute(delete(RaceSession).where(RaceSession.id.in_(session_ids)))
        return len(session_ids)


def _migrate_local_profile() -> None:
    with SessionLocal.begin() as db:
        current = db.get(DriverProfile, LOCAL_PROFILE_ID)
        legacy = db.get(DriverProfile, LEGACY_PROFILE_ID)
        if current is None:
            values = {
                "display_name": "Local Driver",
                "experience_level": "intermediate",
                "input_device": "controller",
                "primary_interest": "mixed",
                "coaching_goal": "consistency",
                "units": "metric",
                "ai_consent": False,
                "cloud_ai_enabled": False,
                "post_session_ai_enabled": False,
                "ai_live_lap_coaching": False,
            }
            if legacy is not None:
                values.update(
                    {key: getattr(legacy, key) for key in values if key != "display_name"}
                )
                if legacy.display_name and legacy.display_name != "De" + "mo Driver":
                    values["display_name"] = legacy.display_name
            current = DriverProfile(id=LOCAL_PROFILE_ID, **values)
            db.add(current)
            db.flush()
        if legacy is not None:
            db.execute(
                update(RaceSession)
                .where(RaceSession.profile_id == LEGACY_PROFILE_ID)
                .values(profile_id=LOCAL_PROFILE_ID)
            )
            db.execute(
                update(Device)
                .where(Device.profile_id == LEGACY_PROFILE_ID)
                .values(profile_id=LOCAL_PROFILE_ID)
            )
            db.delete(legacy)


def _drop_legacy_marker_column() -> bool:
    columns = {column["name"] for column in inspect(engine).get_columns("sessions")}
    if LEGACY_MARKER_COLUMN not in columns:
        return False
    with engine.begin() as connection:
        connection.execute(text(f'DROP INDEX IF EXISTS "ix_sessions_{LEGACY_MARKER_COLUMN}"'))
        connection.execute(text(f'ALTER TABLE sessions DROP COLUMN "{LEGACY_MARKER_COLUMN}"'))
    return True


def _ensure_static_rows() -> None:
    versions = json.loads((REPO_ROOT / "versions.json").read_text(encoding="utf-8"))
    settings = get_settings()
    with SessionLocal.begin() as db:
        if db.get(GameAdapter, "f1-2021-adapter") is None:
            db.add(
                GameAdapter(
                    id="f1-2021-adapter",
                    game_id="f1_2021",
                    adapter_version="0.1.0",
                    telemetry_schema_version=1,
                )
            )
        build_id = f"build-{versions['build']}"
        if db.get(AppBuild, build_id) is None:
            db.add(
                AppBuild(
                    id=build_id,
                    product_version=versions["product"],
                    build_number=versions["build"],
                    git_sha=settings.git_sha,
                    versions_json=versions,
                )
            )


def initialize_database() -> dict:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(
        parents=True, exist_ok=True
    ) if settings.database_url.startswith("sqlite:///") else None
    Base.metadata.create_all(engine)
    removed = _remove_legacy_bundled_rows()
    _migrate_local_profile()
    marker_removed = _drop_legacy_marker_column()
    _ensure_static_rows()
    with SessionLocal() as db:
        session_count = len(db.scalars(select(RaceSession.id)).all())
    return {
        "initialized": True,
        "sessions_created": 0,
        "stored_sessions": session_count,
        "legacy_bundled_sessions_removed": removed,
        "legacy_marker_removed": marker_removed,
    }


def main() -> None:
    print(json.dumps(initialize_database(), indent=2))


if __name__ == "__main__":
    main()
