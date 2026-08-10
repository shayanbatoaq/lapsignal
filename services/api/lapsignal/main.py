from __future__ import annotations

import asyncio
import json
import math
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import (
    BackgroundTasks,
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

from .coach import answer_question, generate_coach_report
from .config import REPO_ROOT, get_settings
from .demo import get_demo_report, get_demo_session, get_demo_sessions
from .schemas import CoachQuestion, CollectorHeartbeat, DriverProfilePayload, IngestBatch
from .seed import seed_database
from .storage import LocalStorage

settings = get_settings()
storage = LocalStorage(settings.data_dir)

LIVE_STATUS: dict = {
    "online": False,
    "collector_id": None,
    "collector_version": None,
    "adapter_version": None,
    "telemetry_schema_version": 1,
    "mode": None,
    "game": "F1 2021",
    "packet_format": 2021,
    "session_uid": None,
    "packet_rate_hz": 0.0,
    "dropped_frames": 0,
    "out_of_order_frames": 0,
    "last_packet_at": None,
    "recording": False,
    "current_sample": None,
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
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_database(reset=False)
    yield


app = FastAPI(
    title="LapSignal API",
    version="0.1.0-alpha.3",
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
            "git_sha": settings.git_sha,
            "build_date": "2026-08-10",
            "compatibility": {
                "collector_api": "compatible",
                "adapter_schema": "compatible",
                "stored_analysis": "compatible",
            },
        }
    )
    return versions


def _lap_without_telemetry(lap: dict) -> dict:
    return {key: value for key, value in lap.items() if key != "telemetry"}


def _session_summary(session: dict) -> dict:
    pace = session["metrics"]["pace"]
    return {
        "id": session["id"],
        "title": session["title"],
        "game_id": session["game_id"],
        "game_label": session["game_label"],
        "track_id": session["track_id"],
        "track_name": session["track_name"],
        "car_id": session["car_id"],
        "car_class": session["car_class"],
        "session_type": session["session_type"],
        "input_device": session["input_device"],
        "started_at": session["started_at"],
        "demo_data": session["demo_data"],
        "analysis_status": session["analysis_status"],
        "lap_count": len(session["laps"]),
        "clean_lap_count": pace["clean_laps"],
        "best_lap_ms": pace["best_lap_ms"],
        "median_lap_ms": pace["median_lap_ms"],
        "consistency_score": pace["consistency_score"],
        "pace_degradation_ms_per_lap": pace["pace_degradation_ms_per_lap"],
        "top_priority": session["findings"][0] if session["findings"] else None,
    }


async def _broadcast(payload: dict) -> None:
    stale = []
    for socket in LIVE_SOCKETS:
        try:
            await socket.send_json(payload)
        except Exception:
            stale.append(socket)
    for socket in stale:
        LIVE_SOCKETS.discard(socket)


async def _ingest(collector_id: str, samples: list[dict]) -> dict:
    if not samples:
        return {"accepted": 0}
    LIVE_BUFFER.extend(samples)
    if len(LIVE_BUFFER) > 1200:
        del LIVE_BUFFER[:-1200]
    current = samples[-1]
    LIVE_STATUS.update(
        {
            "online": True,
            "collector_id": collector_id,
            "session_uid": current.get("session_uid"),
            "last_packet_at": datetime.now(UTC).isoformat(),
            "current_sample": current,
        }
    )
    storage.append_jsonl(f"local/live/{collector_id}.jsonl", samples)
    await _broadcast({"type": "telemetry_batch", "status": LIVE_STATUS, "samples": samples[-30:]})
    return {"accepted": len(samples), "buffer_size": len(LIVE_BUFFER)}


async def _run_demo_replay() -> None:
    session = get_demo_sessions()[0]
    LIVE_STATUS.update({"mode": "replay", "recording": True, "packet_rate_hz": 20.0})
    samples = [sample for lap in session["laps"][:2] for sample in lap["telemetry"][::4]]
    for index in range(0, len(samples), 4):
        await _ingest("demo-replay", samples[index : index + 4])
        await asyncio.sleep(0.08)
    LIVE_STATUS["recording"] = False


@app.get("/health")
def health():
    return {"status": "ok", "mode": "demo" if settings.demo_mode else "local", "database": "ready"}


@app.get("/v1/version")
def version():
    return _versions()


@app.get("/v1/collector/status")
def collector_status():
    return LIVE_STATUS


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
            "dropped_frames": payload.dropped_frames,
            "out_of_order_frames": payload.out_of_order_frames,
            "last_packet_at": payload.last_packet_at.isoformat()
            if payload.last_packet_at
            else None,
        }
    )
    await _broadcast({"type": "collector_status", "status": LIVE_STATUS})
    return {"accepted": True, "compatibility": _versions()["compatibility"]}


@app.post("/v1/ingest/batches")
async def ingest_batch(payload: IngestBatch):
    return await _ingest(payload.collector_id, [sample.model_dump() for sample in payload.samples])


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
    items = [_session_summary(session) for session in get_demo_sessions()]
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


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    session["laps"] = [_lap_without_telemetry(lap) for lap in session["laps"]]
    return session


@app.get("/v1/sessions/{session_id}/laps")
def session_laps(session_id: str):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {"items": [_lap_without_telemetry(lap) for lap in session["laps"]]}


@app.get("/v1/sessions/{session_id}/telemetry")
def session_telemetry(
    session_id: str,
    lap_numbers: str | None = None,
    channels: str = "speed_kph,throttle_0_1,brake_0_1,steer_minus1_1,gear,rpm,current_lap_time_ms",
    max_points: int = Query(700, ge=50, le=2500),
):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
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
    if not get_demo_session(session_id):
        raise HTTPException(404, "Session not found")
    return {"session_id": session_id, "status": "finalized", "analysis_ready": True}


@app.post("/v1/sessions/{session_id}/analyze")
def analyze(session_id: str):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "session_id": session_id,
        "status": "complete",
        **session["metrics"],
        "findings": session["findings"],
    }


@app.post("/v1/sessions/{session_id}/coach")
async def coach(session_id: str):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    cloud_allowed = bool(PROFILE["ai_consent"] and PROFILE["cloud_ai_enabled"])
    return await generate_coach_report(session, cloud_allowed=cloud_allowed)


@app.post("/v1/sessions/{session_id}/coach/questions")
def coach_question(session_id: str, payload: CoachQuestion):
    session = get_demo_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return answer_question(session, payload.question)


@app.get("/v1/progress")
def progress(input_device: str | None = None, days: int = Query(90, ge=7, le=365)):
    sessions = get_demo_sessions()
    if input_device:
        sessions = [session for session in sessions if session["input_device"] == input_device]
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
        for session in sorted(sessions, key=lambda item: item["started_at"])
    ]
    return {
        "days": days,
        "points": points,
        "sessions_by_device": {
            "controller": sum(s["input_device"] == "controller" for s in get_demo_sessions()),
            "wheel": sum(s["input_device"] == "wheel" for s in get_demo_sessions()),
        },
        "skills": {"pace": 74, "consistency": 81, "braking": 77, "throttle": 72, "stint": 79},
        "achievements": [
            {
                "id": "clean-10",
                "label": "10 clean laps",
                "evidence": "Recorded in the hypercar stint.",
            },
            {
                "id": "stable-close",
                "label": "Stable closing phase",
                "evidence": "Derived from stored phase consistency.",
            },
        ],
    }


@app.get("/v1/reports/{report_id}")
def report(report_id: str):
    payload = get_demo_report(report_id)
    if not payload:
        raise HTTPException(404, "Report not found")
    return payload


@app.get("/v1/profile")
def get_profile():
    return PROFILE


@app.put("/v1/profile")
def update_profile(payload: DriverProfilePayload):
    PROFILE.update(payload.model_dump())
    return PROFILE


@app.get("/v1/export")
def export_data():
    return {
        "export_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "profile": PROFILE,
        "sessions": [_session_summary(session) for session in get_demo_sessions()],
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
    return {"deleted": True, "scope": "local user telemetry", "demo_data_preserved": True}


@app.post("/v1/demo/reset")
def reset_demo():
    return seed_database(reset=True)


@app.post("/v1/demo/replay")
async def start_demo_replay(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_demo_replay)
    return {"started": True, "mode": "replay", "collector_id": "demo-replay"}


@app.websocket("/v1/live")
async def live(websocket: WebSocket):
    await websocket.accept()
    LIVE_SOCKETS.add(websocket)
    await websocket.send_json(
        {"type": "snapshot", "status": LIVE_STATUS, "samples": LIVE_BUFFER[-60:]}
    )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        LIVE_SOCKETS.discard(websocket)
