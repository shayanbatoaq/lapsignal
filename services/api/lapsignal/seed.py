from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from .config import get_settings
from .database import Base, SessionLocal, engine
from .demo import get_demo_sessions
from .models import (
    AnalysisRun,
    AppBuild,
    CoachReport,
    DerivedMetric,
    DriverProfile,
    Finding,
    GameAdapter,
    Lap,
    RaceSession,
    Stint,
    TelemetryArtifact,
)
from .storage import LocalStorage


def seed_database(reset: bool = False) -> dict:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    storage = LocalStorage(settings.data_dir)
    sessions = get_demo_sessions()
    summary_payload = []

    with SessionLocal() as db:
        existing = db.scalar(select(RaceSession.id).limit(1))
        if existing and not reset:
            return {"seeded": False, "sessions": len(sessions), "reason": "already_seeded"}

        profile = DriverProfile(
            id="demo-driver",
            display_name="Demo Driver",
            experience_level="intermediate",
            input_device="controller",
            primary_interest="mixed",
            coaching_goal="consistency",
            units="metric",
            ai_consent=False,
        )
        adapter = GameAdapter(
            id="f1-2021-adapter",
            game_id="f1_2021",
            adapter_version="0.1.0",
            telemetry_schema_version=1,
        )
        db.add_all([profile, adapter])

        for session in sessions:
            pace = session["metrics"]["pace"]
            db_session = RaceSession(
                id=session["id"],
                profile_id=profile.id,
                adapter_id=adapter.id,
                session_uid=session["session_uid"],
                game_id=session["game_id"],
                track_id=session["track_id"],
                car_id=session["car_id"],
                car_class=session["car_class"],
                session_type=session["session_type"],
                input_device=session["input_device"],
                started_at=datetime.fromisoformat(session["started_at"]),
                completed_at=datetime.fromisoformat(session["completed_at"]),
                demo_data=True,
                status="analyzed",
                best_lap_ms=pace["best_lap_ms"],
                consistency_score=pace["consistency_score"],
                provenance=session["provenance"],
            )
            db.add(db_session)
            stint_id = f"{session['id']}-stint-1"
            db.add(
                Stint(
                    id=stint_id,
                    session_id=session["id"],
                    number=1,
                    start_lap=1,
                    end_lap=len(session["laps"]),
                    compound="synthetic dry" if session["laps"][0]["tyre_wear_pct"] else None,
                )
            )
            rows: list[dict] = []
            for lap in session["laps"]:
                db.add(
                    Lap(
                        id=lap["id"],
                        session_id=session["id"],
                        stint_id=stint_id,
                        lap_number=lap["lap_number"],
                        lap_time_ms=lap["lap_time_ms"],
                        sector_times_ms=lap["sector_times_ms"],
                        valid=lap["valid"],
                        classification=lap["classification"],
                        quality_score=lap["quality_score"],
                    )
                )
                rows.extend(lap["telemetry"])
            artifact_path = storage.write_parquet(f"demo/{session['id']}.parquet", rows)
            db.add(
                TelemetryArtifact(
                    id=f"artifact-{session['id']}",
                    session_id=session["id"],
                    kind="normalized",
                    path=str(artifact_path.relative_to(settings.data_dir)),
                    format="parquet",
                    sample_count=len(rows),
                    schema_version=1,
                    checksum=storage.checksum(artifact_path),
                )
            )
            analysis_id = f"analysis-{session['id']}"
            db.add(
                AnalysisRun(
                    id=analysis_id,
                    session_id=session["id"],
                    version="0.1.0",
                    status="complete",
                    limitations=pace["limitations"] + session["metrics"]["stint"]["limitations"],
                )
            )
            for key, value in pace.items():
                if isinstance(value, (int, float)):
                    unit = "ms" if key.endswith("_ms") else "score" if "score" in key else "value"
                    db.add(
                        DerivedMetric(
                            id=f"metric-{session['id']}-{key}",
                            session_id=session["id"],
                            key=key,
                            value=float(value),
                            unit=unit,
                            scope="session",
                            metadata_json={"analysis_version": "0.1.0"},
                        )
                    )
            for finding in session["findings"]:
                db.add(
                    Finding(
                        id=finding["id"],
                        analysis_run_id=analysis_id,
                        session_id=session["id"],
                        finding_type=finding["type"],
                        priority=finding["priority"],
                        severity=finding["severity"],
                        confidence=finding["confidence"],
                        title=finding["title"],
                        plain_language=finding["plain_language"],
                        recommended_action=finding["recommended_action"],
                        evidence=finding["evidence"],
                        limitations=finding["limitations"],
                    )
                )
            db.add(
                CoachReport(
                    id=session["report"]["id"],
                    session_id=session["id"],
                    analysis_run_id=analysis_id,
                    mode="rule_based",
                    report_json=session["report"],
                )
            )
            summary = {key: value for key, value in session.items() if key != "laps"}
            summary["laps"] = [
                {key: value for key, value in lap.items() if key != "telemetry"}
                for lap in session["laps"]
            ]
            summary_payload.append(summary)

        versions = json.loads((Path(__file__).resolve().parents[3] / "versions.json").read_text())
        db.add(
            AppBuild(
                id="build-1",
                product_version=versions["product"],
                build_number=versions["build"],
                git_sha=settings.git_sha,
                versions_json=versions,
            )
        )
        db.commit()

    storage.write_json("demo/sessions.json", summary_payload)
    replay_path = settings.data_dir / "fixtures/f1-2021-replay.jsonl"
    replay_path.parent.mkdir(parents=True, exist_ok=True)
    replay_session = sessions[0]
    replay_rows = [sample for lap in replay_session["laps"][:2] for sample in lap["telemetry"][::3]]
    replay_path.write_text(
        "\n".join(json.dumps(row) for row in replay_rows) + "\n", encoding="utf-8"
    )
    return {
        "seeded": True,
        "sessions": len(sessions),
        "samples": sum(
            len(lap["telemetry"]) for session in sessions for lap in session["laps"]
        ),
    }


def main() -> None:
    print(json.dumps(seed_database(reset=True), indent=2))


if __name__ == "__main__":
    main()
