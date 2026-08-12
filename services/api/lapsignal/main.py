from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import signal
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .ai import ProviderFailure, coach_schema_hash, generate_with_fallback, safe_status
from .build_identity import api_build_identity
from .circuit_calibrations import CircuitCalibrationRepository
from .coach import answer_question
from .config import REPO_ROOT, get_settings
from .database import SessionLocal
from .database_init import initialize_database
from .live_sessions import (
    ensure_live_session,
    finalize_live_session,
    live_session_payload,
    live_session_summaries,
    session_map_sample,
)
from .models import CoachReport, DriverProfile, RaceSession
from .schemas import (
    CoachQuestion,
    CollectorHeartbeat,
    CollectorSessionEvent,
    DriverProfilePayload,
    IngestBatch,
    PerformanceModePayload,
    SessionDetailResponse,
)
from .storage import LocalStorage

settings = get_settings()
storage = LocalStorage(settings.data_dir)
calibration_repository = CircuitCalibrationRepository(
    settings.data_dir, asset_data_dir=REPO_ROOT / "data"
)

LIVE_STATUS: dict = {
    "online": False,
    "collector_id": None,
    "collector_version": None,
    "adapter_version": None,
    "telemetry_schema_version": 1,
    "mode": None,
    "game": None,
    "packet_format": None,
    "session_uid": None,
    "packet_rate_hz": 0.0,
    "packet_loss_available": False,
    "out_of_order_frames": 0,
    "last_packet_at": None,
    "recording": False,
    "current_sample": None,
    "state": "OFFLINE",
    "context": {},
}
LIVE_SOCKETS: set[WebSocket] = set()
LIVE_BUFFER: list[dict] = []
PROFILE: dict = {
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    stop = asyncio.Event()
    task = asyncio.create_task(_inactivity_monitor(stop))
    managed_stop_task = asyncio.create_task(_managed_stop_monitor(stop))
    yield
    stop.set()
    await task
    await managed_stop_task


app = FastAPI(
    title="LapSignal API",
    version="0.1.0-alpha.4",
    description="Evidence-backed local telemetry ingestion, analytics, and coaching.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def safety_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "error": {
                    "code": "request_too_large",
                    "message": "Request exceeds the local ingestion limit.",
                },
                "request_id": request_id,
            },
        )
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["referrer-policy"] = "same-origin"
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "The request did not match the telemetry contract.",
                "details": exc.errors(),
            },
            "request_id": request.headers.get("x-request-id"),
        },
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {"code": "http_error", "message": str(exc.detail)},
            "request_id": request.headers.get("x-request-id"),
        },
    )


def _versions() -> dict:
    versions = json.loads((REPO_ROOT / "versions.json").read_text(encoding="utf-8"))
    versions.update(
        {
            "git_sha": _build_identity()["git_commit"],
            "build_date": "2026-08-10",
            "compatibility": {
                "collector_api": "compatible",
                "adapter_schema": "compatible",
                "stored_analysis": "compatible",
            },
        }
    )
    return versions


def _build_identity() -> dict:
    try:
        with SessionLocal() as db:
            cloud_ai_enabled = bool(_profile_dict(db)["cloud_ai_enabled"])
    except Exception:
        cloud_ai_enabled = False
    return api_build_identity(
        cloud_ai_enabled=cloud_ai_enabled,
        schema_hash=coach_schema_hash(),
    )


async def _broadcast(payload: dict) -> None:
    stale = []
    for socket in LIVE_SOCKETS:
        try:
            await socket.send_json(payload)
        except Exception:
            stale.append(socket)
    for socket in stale:
        LIVE_SOCKETS.discard(socket)


def _public_live_status() -> dict:
    last = LIVE_STATUS.get("last_packet_at")
    fresh = False
    if last:
        try:
            fresh = datetime.now(UTC) - datetime.fromisoformat(last) < timedelta(seconds=5)
        except (ValueError, TypeError):
            pass
    mode = LIVE_STATUS.get("mode")
    state = (
        "LIVE"
        if fresh and mode == "live"
        else "REPLAY"
        if fresh and mode == "replay"
        else "OFFLINE"
    )
    return {
        **LIVE_STATUS,
        "circuit_map": calibration_repository.status_for(LIVE_STATUS.get("current_sample")),
        "api_build_identity": _build_identity(),
        "online": state in {"LIVE", "REPLAY"},
        "state": state,
        "source_label": {
            "LIVE": "Live PS4 telemetry",
            "REPLAY": "Recorded telemetry replay",
            "OFFLINE": "Collector offline",
        }[state],
    }


async def _inactivity_monitor(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=2)
        except TimeoutError:
            pass
        if stop.is_set():
            break
        uid = LIVE_STATUS.get("session_uid")
        last = LIVE_STATUS.get("last_packet_at")
        if uid and last and LIVE_STATUS.get("mode") == "live":
            try:
                stale = datetime.now(UTC) - datetime.fromisoformat(last) > timedelta(
                    seconds=settings.live_session_inactivity_seconds
                )
            except (ValueError, TypeError):
                stale = False
            if stale:
                with SessionLocal() as db:
                    finalize_live_session(db, uid, interrupted=True)
                LIVE_STATUS["recording"] = False


async def _managed_stop_monitor(stop: asyncio.Event) -> None:
    raw_path = os.getenv("LAPSIGNAL_STOP_FILE")
    if not raw_path:
        await stop.wait()
        return
    stop_path = (REPO_ROOT / "data" / "local" / "dev-services" / Path(raw_path).name).resolve()
    expected_parent = (REPO_ROOT / "data" / "local" / "dev-services").resolve()
    if stop_path.parent != expected_parent:
        await stop.wait()
        return
    while not stop.is_set():
        if stop_path.is_file():
            stop_path.unlink(missing_ok=True)
            os.kill(os.getpid(), signal.SIGINT)
            return
        try:
            await asyncio.wait_for(stop.wait(), timeout=0.4)
        except TimeoutError:
            pass


async def _ingest(collector_id: str, samples: list[dict]) -> dict:
    if not samples:
        return {"accepted": 0}
    LIVE_BUFFER.extend(samples)
    if len(LIVE_BUFFER) > 1200:
        del LIVE_BUFFER[:-1200]
    current = samples[-1]
    previous_uid = LIVE_STATUS.get("session_uid")
    if (
        previous_uid
        and previous_uid != current.get("session_uid")
        and LIVE_STATUS.get("mode") == "live"
    ):
        with SessionLocal() as db:
            finalize_live_session(db, previous_uid, interrupted=False)
    with SessionLocal() as db:
        ensure_live_session(db, current)
    LIVE_STATUS.update(
        {
            "online": True,
            "collector_id": collector_id,
            "session_uid": current.get("session_uid"),
            "last_packet_at": datetime.now(UTC).isoformat(),
            "current_sample": current,
            "recording": True,
            "context": {
                key: current.get(key)
                for key in (
                    "game_id",
                    "packet_format",
                    "game_track_id",
                    "track_id",
                    "track_name",
                    "track_length_m",
                    "weather",
                    "formula",
                    "team_id",
                    "team_name",
                    "car_number",
                    "assist_profile",
                    "session_type",
                )
            },
        }
    )
    storage.append_jsonl(f"local/live/sessions/{current['session_uid']}.jsonl", samples)
    await _broadcast(
        {"type": "telemetry_batch", "status": _public_live_status(), "samples": samples[-30:]}
    )
    return {"accepted": len(samples), "buffer_size": len(LIVE_BUFFER)}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": "local",
        "database": "ready",
        **_build_identity(),
    }


@app.get("/v1/version")
def version():
    return {**_versions(), "build_identity": _build_identity()}


@app.get("/v1/collector/status")
def collector_status():
    return _public_live_status()


@app.get("/v1/circuit-calibrations/current")
def current_circuit_calibration():
    return calibration_repository.status_for(LIVE_STATUS.get("current_sample"))


@app.get("/v1/circuit-calibrations")
def circuit_calibrations():
    return calibration_repository.list_calibrations()


@app.delete("/v1/circuit-calibrations/local/{fingerprint}")
def reset_local_circuit_calibration(fingerprint: str, confirm: str = ""):
    if confirm != "RESET LOCAL REFINEMENT":
        raise HTTPException(400, "Explicit local-refinement reset confirmation is required")
    try:
        return calibration_repository.reset_local(fingerprint)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@app.post("/v1/collector/heartbeat")
async def collector_heartbeat(payload: CollectorHeartbeat):
    LIVE_STATUS.update(
        {
            "online": True,
            "collector_id": payload.collector_id,
            "collector_version": payload.collector_version,
            "adapter_version": payload.adapter_version,
            "telemetry_schema_version": payload.telemetry_schema_version,
            "mode": payload.mode,
            "session_uid": payload.session_uid,
            "packet_rate_hz": payload.packet_rate_hz,
            "packet_loss_available": False,
            "out_of_order_frames": payload.out_of_order_frames,
            "last_packet_at": payload.last_packet_at.isoformat()
            if payload.last_packet_at
            else None,
            "collector_build_identity": payload.build_identity.model_dump(mode="json"),
        }
    )
    await _broadcast({"type": "collector_status", "status": _public_live_status()})
    return {"accepted": True, "compatibility": _versions()["compatibility"]}


@app.post("/v1/ingest/batches")
async def ingest_batch(payload: IngestBatch):
    return await _ingest(payload.collector_id, [sample.model_dump() for sample in payload.samples])


@app.post("/v1/collector/session-events")
async def collector_session_event(payload: CollectorSessionEvent):
    with SessionLocal() as db:
        result = finalize_live_session(
            db,
            payload.session_uid,
            interrupted=payload.interrupted,
            raw_capture_path=payload.raw_capture_path,
            normalized_capture_path=payload.normalized_capture_path,
        )
    LIVE_STATUS["recording"] = False
    await _broadcast(
        {"type": "session_finalized", "status": _public_live_status(), "result": result}
    )
    return result


@app.get("/v1/sessions")
def sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    search: str | None = None,
    game: str | None = None,
    track: str | None = None,
    car_class: str | None = None,
    input_device: str | None = None,
    session_type: str | None = None,
    sort: str = "date_desc",
):
    with SessionLocal() as db:
        items = live_session_summaries(db)
    if search:
        needle = search.lower()
        items = [item for item in items if needle in json.dumps(item).lower()]
    filters = {
        "game_id": game,
        "track_id": track,
        "car_class": car_class,
        "input_device": input_device,
        "session_type": session_type,
    }
    for key, value in filters.items():
        if value:
            items = [item for item in items if str(item[key]).lower() == value.lower()]
    if sort == "best_lap":
        items.sort(key=lambda item: item["best_lap_ms"] or math.inf)
    elif sort == "consistency":
        items.sort(key=lambda item: item["consistency_score"], reverse=True)
    else:
        items.sort(key=lambda item: item["started_at"], reverse=sort != "date_asc")
    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(1, math.ceil(total / page_size)),
    }


@app.get("/v1/sessions/{session_id}", response_model=SessionDetailResponse)
def session_detail(session_id: str):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        payload = live_session_payload(db, row)
        payload["circuit_map"] = calibration_repository.status_for(
            session_map_sample(row.session_uid)
        )
        return payload


@app.get("/v1/sessions/{session_id}/laps")
def session_laps(session_id: str):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        return {"items": live_session_payload(db, row)["laps"]}


@app.get("/v1/sessions/{session_id}/telemetry")
def session_telemetry(
    session_id: str,
    lap_numbers: str | None = None,
    channels: str = "speed_kph,throttle_0_1,brake_0_1,steer_minus1_1,gear,rpm,current_lap_time_ms",
    max_points: int = Query(700, ge=50, le=2500),
):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        session = live_session_payload(db, row, include_telemetry=True)
    selected = {int(value) for value in lap_numbers.split(",")} if lap_numbers else {1}
    allowed = {
        "speed_kph",
        "throttle_0_1",
        "brake_0_1",
        "steer_minus1_1",
        "gear",
        "rpm",
        "current_lap_time_ms",
        "position_x",
        "position_z",
    }
    requested = [channel for channel in channels.split(",") if channel in allowed]
    traces = []
    for lap in session["laps"]:
        if lap["lap_number"] not in selected:
            continue
        samples = lap["telemetry"]
        step = max(1, math.ceil(len(samples) / max_points))
        traces.append(
            {
                "lap_number": lap["lap_number"],
                "lap_time_ms": lap["lap_time_ms"],
                "valid": lap["valid"],
                "quality_score": lap["quality_score"],
                "samples": [
                    {
                        "lap_distance_m": sample["lap_distance_m"],
                        **{channel: sample.get(channel) for channel in requested},
                    }
                    for sample in samples[::step]
                ],
            }
        )
    return {"session_id": session_id, "channels": requested, "traces": traces, "downsampled": True}


@app.post("/v1/sessions/{session_id}/finalize")
def finalize_session(session_id: str):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        return finalize_live_session(db, row.session_uid, interrupted=True)


@app.post("/v1/sessions/{session_id}/analyze")
def analyze(session_id: str):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        session = live_session_payload(db, row)
        return {
            "session_id": session_id,
            "status": row.status,
            **session["metrics"],
            "findings": session["findings"],
        }


@app.post("/v1/sessions/{session_id}/coach")
async def coach(session_id: str, regenerate: bool = False):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        session = live_session_payload(db, row, include_telemetry=True)
        return await generate_with_fallback(
            db, session, _profile_dict(db), regenerate=regenerate, max_tokens=1_500
        )


@app.put("/v1/sessions/{session_id}/performance-mode")
def set_performance_mode(session_id: str, payload: PerformanceModePayload):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        row.performance_mode = payload.performance_mode
        row.performance_mode_source = payload.performance_mode_source
        db.commit()
        return {"session_id": session_id, **payload.model_dump()}


@app.put("/v1/live/performance-mode")
def set_live_performance_mode(payload: PerformanceModePayload):
    uid = LIVE_STATUS.get("session_uid")
    if not uid:
        raise HTTPException(409, "No active live session")
    with SessionLocal() as db:
        row = db.scalar(select(RaceSession).where(RaceSession.session_uid == uid))
        if not row:
            raise HTTPException(404, "Live session not found")
        row.performance_mode = payload.performance_mode
        row.performance_mode_source = payload.performance_mode_source
        db.commit()
    LIVE_STATUS["performance_mode"] = payload.performance_mode
    LIVE_STATUS["performance_mode_source"] = payload.performance_mode_source
    return {"session_id": row.id, **payload.model_dump()}


@app.post("/v1/sessions/{session_id}/coach/questions")
def coach_question(session_id: str, payload: CoachQuestion):
    with SessionLocal() as db:
        row = db.get(RaceSession, session_id)
        if not row:
            raise HTTPException(404, "Session not found")
        return answer_question(live_session_payload(db, row), payload.question)


@app.get("/v1/progress")
def progress(input_device: str | None = None, days: int = Query(90, ge=7, le=365)):
    with SessionLocal() as db:
        rows = db.scalars(select(RaceSession).order_by(RaceSession.started_at)).all()
        sessions = [live_session_payload(db, row) for row in rows]
    if input_device:
        sessions = [item for item in sessions if item["input_device"] == input_device]
    points = [
        {
            "session_id": session["id"],
            "date": session["started_at"],
            "input_device": session["input_device"],
            "best_lap_ms": session["metrics"]["pace"]["best_lap_ms"],
            "median_lap_ms": session["metrics"]["pace"]["median_lap_ms"],
            "consistency_score": session["metrics"]["pace"]["consistency_score"],
            "braking_consistency": round(100 - len(session["metrics"]["braking"]) * 0.6, 1),
            "throttle_pickup_score": round(
                90 - (session["metrics"]["throttle"].get("time_to_full_s") or 0) * 5, 1
            ),
        }
        for session in sessions
    ]
    return {
        "days": days,
        "points": points,
        "sessions_by_device": {
            "controller": sum(s["input_device"] == "controller" for s in sessions),
            "wheel": sum(s["input_device"] == "wheel" for s in sessions),
            "unknown": sum(s["input_device"] == "unknown" for s in sessions),
        },
        "skills": {},
        "achievements": [],
    }


@app.get("/v1/reports/{report_id}")
def report(report_id: str):
    with SessionLocal() as db:
        payload = db.get(CoachReport, report_id)
        if not payload:
            raise HTTPException(404, "Report not found")
        return payload.report_json


@app.get("/v1/profile")
def get_profile():
    with SessionLocal() as db:
        return _profile_dict(db)


@app.put("/v1/profile")
def update_profile(payload: DriverProfilePayload):
    with SessionLocal() as db:
        row = db.get(DriverProfile, "local-driver")
        if not row:
            raise HTTPException(500, "Local profile is unavailable")
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
        db.commit()
        return _profile_dict(db)


def _profile_dict(db) -> dict:
    row = db.get(DriverProfile, "local-driver")
    if not row:
        return PROFILE
    return {
        key: getattr(row, key)
        for key in (
            "experience_level",
            "input_device",
            "primary_interest",
            "coaching_goal",
            "units",
            "ai_consent",
            "cloud_ai_enabled",
            "post_session_ai_enabled",
            "ai_live_lap_coaching",
        )
    }


@app.get("/v1/ai/status")
async def ai_status(validate_model: bool = False):
    status = safe_status()
    if validate_model and status["configured"]:
        with SessionLocal() as db:
            profile = _profile_dict(db)
        if not (profile["ai_consent"] and profile["cloud_ai_enabled"]):
            status["model_validation_skipped"] = "cloud_ai_disabled"
            return status
        try:
            status.update(
                await __import__("lapsignal.ai", fromlist=["get_provider"])
                .get_provider()
                .health_check()
            )
        except ProviderFailure as failure:
            status.update(reachable=False, last_error_category=failure.category)
    return status


@app.get("/v1/export")
def export_data():
    with SessionLocal() as db:
        summaries = live_session_summaries(db)
    return {
        "export_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "profile": get_profile(),
        "sessions": summaries,
        "note": "High-frequency raw telemetry is excluded from this summary export.",
    }


@app.delete("/v1/local-data")
def delete_local_data(confirm: str = Query(...)):
    if confirm != "DELETE LOCAL DATA":
        raise HTTPException(400, "Confirmation phrase does not match")
    target = (settings.data_dir / "local").resolve()
    if settings.data_dir.resolve() not in target.parents:
        raise HTTPException(400, "Unsafe data path")
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    return {"deleted": True, "scope": "local user telemetry"}


@app.websocket("/v1/live")
async def live(websocket: WebSocket):
    await websocket.accept()
    LIVE_SOCKETS.add(websocket)
    await websocket.send_json(
        {"type": "snapshot", "status": _public_live_status(), "samples": LIVE_BUFFER[-60:]}
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        LIVE_SOCKETS.discard(websocket)
