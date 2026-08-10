from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .analytics import analyze_session
from .config import get_settings
from .demo import build_fallback_report
from .models import (
    AnalysisRun,
    CoachReport,
    DerivedMetric,
    Finding,
    GameAdapter,
    Lap,
    RaceSession,
    Stint,
    TelemetryArtifact,
)
from .storage import LocalStorage


def session_id(uid: str) -> str:
    return "live-" + "".join(ch for ch in uid if ch.isalnum() or ch in "-_")[:80]


def ensure_live_session(db: Session, sample: dict) -> RaceSession:
    uid = sample["session_uid"]
    row = db.scalar(select(RaceSession).where(RaceSession.session_uid == uid))
    now = datetime.now(UTC).replace(tzinfo=None)
    context_fields = (
        "track_name",
        "track_length_m",
        "weather",
        "formula",
        "team_id",
        "team_name",
        "car_number",
        "assist_profile",
    )
    context = {key: sample.get(key) for key in context_fields if sample.get(key) is not None}
    if row:
        merged = {**(row.context_json or {}), **context}
        row.context_json = merged
        row.track_id = sample.get("track_id") or row.track_id
        row.car_id = sample.get("car_id") or row.car_id
        row.car_class = sample.get("car_class") or row.car_class
        row.session_type = sample.get("session_type") or row.session_type
        row.last_packet_at = now
        db.commit()
        return row
    adapter = db.scalar(select(GameAdapter).where(GameAdapter.game_id == sample["game_id"]))
    if not adapter:
        adapter = GameAdapter(
            id=f"{sample['game_id']}-adapter",
            game_id=sample["game_id"],
            adapter_version=sample["adapter_version"],
            telemetry_schema_version=sample["schema_version"],
        )
        db.add(adapter)
        db.flush()
    row = RaceSession(
        id=session_id(uid),
        profile_id="demo-driver",
        adapter_id=adapter.id,
        session_uid=uid,
        game_id=sample["game_id"],
        track_id=sample.get("track_id") or "unknown-track",
        car_id=sample.get("car_id") or "unknown-car",
        car_class=sample.get("car_class") or "Unknown formula",
        session_type=sample.get("session_type") or "Unknown",
        input_device=sample.get("input_device") or "unknown",
        started_at=now,
        completed_at=None,
        demo_data=False,
        status="recording",
        provenance={"source": "physical_udp", "schema_version": 1},
        context_json=context,
        performance_mode="unknown",
        performance_mode_source="unknown",
        last_packet_at=now,
        interrupted=False,
    )
    db.add(row)
    db.commit()
    return row


def _artifact_reference(path_value: str | None) -> str | None:
    if not path_value:
        return None
    settings = get_settings()
    path = Path(path_value).resolve()
    try:
        return path.relative_to(settings.data_dir.resolve()).as_posix()
    except ValueError:
        return f"external/{path.name}"


def _load_samples(uid: str) -> list[dict]:
    path = get_settings().data_dir / "local" / "live" / "sessions" / f"{uid}.jsonl"
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _completed_laps(samples: list[dict]) -> list[dict]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for sample in samples:
        if int(sample.get("lap_number") or 0) > 0:
            grouped[int(sample["lap_number"])].append(sample)
    laps = []
    numbers = sorted(grouped)
    for number in numbers:
        rows = grouped[number]
        next_rows = grouped.get(number + 1, [])
        lap_time = next(
            (
                int(float(row.get("last_lap_time_ms") or 0))
                for row in next_rows
                if float(row.get("last_lap_time_ms") or 0) > 0
            ),
            None,
        )
        if lap_time is None:
            continue
        laps.append(
            {
                "id": f"{number}",
                "lap_number": number,
                "lap_time_ms": lap_time,
                "sector_times_ms": [],
                "valid": not any(bool(row.get("lap_invalid")) for row in rows),
                "classification": "clean"
                if not any(bool(row.get("lap_invalid")) for row in rows)
                else "invalid",
                "quality_score": 1.0 if len(rows) >= 20 else round(min(1.0, len(rows) / 20), 2),
                "telemetry": rows,
                "tyre_wear_pct": rows[-1].get("tyre_wear"),
            }
        )
    return laps


def finalize_live_session(
    db: Session,
    uid: str,
    *,
    interrupted: bool,
    raw_capture_path: str | None = None,
    normalized_capture_path: str | None = None,
) -> dict:
    row = db.scalar(select(RaceSession).where(RaceSession.session_uid == uid))
    if not row:
        return {"session_uid": uid, "status": "not_found", "idempotent": True}
    if row.status == "analyzed":
        return {
            "session_id": row.id,
            "status": "analyzed",
            "idempotent": True,
            "analysis_ready": True,
        }
    samples = _load_samples(uid)
    laps = _completed_laps(samples)
    context = row.context_json or {}
    payload = {
        "id": row.id,
        "title": f"{context.get('track_name', row.track_id)} · {row.session_type}",
        "session_uid": uid,
        "game_id": row.game_id,
        "game_label": "F1 2021",
        "track_id": row.track_id,
        "track_name": context.get("track_name", row.track_id),
        "car_id": row.car_id,
        "car_class": row.car_class,
        "session_type": row.session_type,
        "input_device": row.input_device,
        "started_at": row.started_at.replace(tzinfo=UTC).isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
        "demo_data": False,
        "analysis_status": "complete",
        "performance_mode": row.performance_mode,
        "performance_mode_source": row.performance_mode_source,
        "context": context,
        "laps": laps,
        "provenance": {**(row.provenance or {}), "interrupted": interrupted},
    }
    analysis = analyze_session(payload)
    payload.update(analysis)
    payload["report"] = build_fallback_report(payload)
    now = datetime.now(UTC).replace(tzinfo=None)
    analysis_id = f"analysis-{row.id}"
    try:
        db.execute(delete(CoachReport).where(CoachReport.session_id == row.id))
        db.execute(delete(Finding).where(Finding.session_id == row.id))
        db.execute(delete(DerivedMetric).where(DerivedMetric.session_id == row.id))
        db.execute(delete(AnalysisRun).where(AnalysisRun.session_id == row.id))
        db.execute(delete(Lap).where(Lap.session_id == row.id))
        db.execute(delete(Stint).where(Stint.session_id == row.id))
        if laps:
            stint = Stint(
                id=f"{row.id}-stint-1",
                session_id=row.id,
                number=1,
                start_lap=laps[0]["lap_number"],
                end_lap=laps[-1]["lap_number"],
                compound=None,
            )
            db.add(stint)
            for lap in laps:
                db.add(
                    Lap(
                        id=f"{row.id}-lap-{lap['lap_number']}",
                        session_id=row.id,
                        stint_id=stint.id,
                        lap_number=lap["lap_number"],
                        lap_time_ms=lap["lap_time_ms"],
                        sector_times_ms=[],
                        valid=lap["valid"],
                        classification=lap["classification"],
                        quality_score=lap["quality_score"],
                    )
                )
        db.add(
            AnalysisRun(
                id=analysis_id,
                session_id=row.id,
                version="0.1.0",
                status="complete",
                limitations=analysis["metrics"]["pace"].get("limitations", []),
            )
        )
        for finding in analysis["findings"]:
            db.add(
                Finding(
                    id=finding["id"],
                    analysis_run_id=analysis_id,
                    session_id=row.id,
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
        pace = analysis["metrics"]["pace"]
        for key, value in pace.items():
            if isinstance(value, (int, float)):
                db.add(
                    DerivedMetric(
                        id=f"metric-{row.id}-{key}",
                        session_id=row.id,
                        key=key,
                        value=float(value),
                        unit="ms" if "ms" in key else "score" if "score" in key else "value",
                        scope="session",
                        metadata_json={"analysis_version": "0.1.0"},
                    )
                )
        db.add(
            CoachReport(
                id=payload["report"]["id"],
                session_id=row.id,
                analysis_run_id=analysis_id,
                mode="rule_based",
                report_json=payload["report"],
            )
        )
        storage = LocalStorage(get_settings().data_dir)
        if samples:
            parquet = storage.write_parquet(f"local/sessions/{row.id}.parquet", samples)
            existing = db.scalar(
                select(TelemetryArtifact).where(
                    TelemetryArtifact.session_id == row.id, TelemetryArtifact.kind == "normalized"
                )
            )
            if not existing:
                db.add(
                    TelemetryArtifact(
                        id=f"artifact-{row.id}-normalized",
                        session_id=row.id,
                        kind="normalized",
                        path=str(parquet.relative_to(get_settings().data_dir)),
                        format="parquet",
                        sample_count=len(samples),
                        schema_version=1,
                        checksum=storage.checksum(parquet),
                    )
                )
        raw_ref = _artifact_reference(raw_capture_path)
        if raw_ref and not db.scalar(
            select(TelemetryArtifact).where(
                TelemetryArtifact.session_id == row.id, TelemetryArtifact.kind == "raw"
            )
        ):
            db.add(
                TelemetryArtifact(
                    id=f"artifact-{row.id}-raw",
                    session_id=row.id,
                    kind="raw",
                    path=raw_ref,
                    format="lsraw",
                    sample_count=0,
                    schema_version=1,
                    checksum=None,
                )
            )
        row.completed_at = now
        row.status = "analyzed"
        row.best_lap_ms = pace.get("best_lap_ms")
        row.consistency_score = pace.get("consistency_score")
        row.interrupted = interrupted
        row.provenance = {
            **(row.provenance or {}),
            "interrupted": interrupted,
            "normalized_capture": _artifact_reference(normalized_capture_path),
        }
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "session_id": row.id,
        "status": "analyzed",
        "idempotent": False,
        "analysis_ready": True,
        "completed_laps": len(laps),
        "interrupted": interrupted,
    }


def live_session_payload(db: Session, row: RaceSession, include_telemetry: bool = False) -> dict:
    laps = db.scalars(select(Lap).where(Lap.session_id == row.id).order_by(Lap.lap_number)).all()
    findings = db.scalars(
        select(Finding).where(Finding.session_id == row.id).order_by(Finding.priority)
    ).all()
    metrics = {
        item.key: item.value
        for item in db.scalars(
            select(DerivedMetric).where(DerivedMetric.session_id == row.id)
        ).all()
    }
    report = db.scalar(select(CoachReport).where(CoachReport.session_id == row.id))
    context = row.context_json or {}
    return {
        "id": row.id,
        "title": f"{context.get('track_name', row.track_id)} · {row.session_type}",
        "session_uid": row.session_uid,
        "game_id": row.game_id,
        "game_label": "F1 2021",
        "track_id": row.track_id,
        "track_name": context.get("track_name", row.track_id),
        "car_id": row.car_id,
        "car_class": row.car_class,
        "session_type": row.session_type,
        "input_device": row.input_device,
        "started_at": row.started_at.replace(tzinfo=UTC).isoformat(),
        "completed_at": row.completed_at.replace(tzinfo=UTC).isoformat()
        if row.completed_at
        else None,
        "demo_data": False,
        "analysis_status": row.status,
        "performance_mode": row.performance_mode,
        "performance_mode_source": row.performance_mode_source,
        "context": context,
        "interrupted": row.interrupted,
        "laps": [
            {
                "id": lap.id,
                "lap_number": lap.lap_number,
                "lap_time_ms": lap.lap_time_ms,
                "sector_times_ms": lap.sector_times_ms,
                "valid": lap.valid,
                "classification": lap.classification,
                "quality_score": lap.quality_score,
                **({"telemetry": []} if include_telemetry else {}),
            }
            for lap in laps
        ],
        "metrics": {
            "pace": {
                "best_lap_ms": row.best_lap_ms,
                "consistency_score": row.consistency_score,
                **metrics,
            },
            "stint": {"limitations": [], "phase_consistency": {}},
        },
        "findings": [
            {
                "id": item.id,
                "type": item.finding_type,
                "priority": item.priority,
                "severity": item.severity,
                "confidence": item.confidence,
                "title": item.title,
                "plain_language": item.plain_language,
                "recommended_action": item.recommended_action,
                "evidence": item.evidence,
                "limitations": item.limitations,
                "analysis_version": "0.1.0",
            }
            for item in findings
        ],
        "report": report.report_json
        if report
        else {
            "id": f"report-{row.id}",
            "label": "Rule-based coaching",
            "session_summary": "Analysis is not ready.",
            "top_priorities": [],
            "what_improved": "",
            "what_regressed": "",
            "next_stint_plan": "",
            "limitations": [],
            "provenance": {"fallback_used": True},
        },
    }


def live_session_summaries(db: Session) -> list[dict]:
    rows = db.scalars(
        select(RaceSession)
        .where(RaceSession.demo_data.is_(False))
        .order_by(RaceSession.started_at.desc())
    ).all()
    result = []
    for row in rows:
        payload = live_session_payload(db, row)
        result.append(
            {
                k: payload.get(k)
                for k in (
                    "id",
                    "title",
                    "game_id",
                    "game_label",
                    "track_id",
                    "track_name",
                    "car_id",
                    "car_class",
                    "session_type",
                    "input_device",
                    "started_at",
                    "demo_data",
                    "analysis_status",
                )
            }
            | {
                "lap_count": len(payload["laps"]),
                "clean_lap_count": sum(lap["valid"] for lap in payload["laps"]),
                "best_lap_ms": row.best_lap_ms,
                "median_lap_ms": None,
                "consistency_score": row.consistency_score or 0,
                "pace_degradation_ms_per_lap": None,
                "top_priority": payload["findings"][0] if payload["findings"] else None,
                "performance_mode": row.performance_mode,
                "performance_mode_source": row.performance_mode_source,
                "interrupted": row.interrupted,
            }
        )
    return result
