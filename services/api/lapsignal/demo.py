from __future__ import annotations

import math
import random
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from .analytics import analyze_session

DEMO_SEED = 20210809

SESSION_CONFIGS = [
    {
        "id": "f1-controller-silverstone",
        "title": "Silverstone controller race simulation",
        "game_id": "f1_2021",
        "game_label": "F1 2021",
        "track_id": "silverstone",
        "track_name": "Silverstone",
        "track_length_m": 5891.0,
        "car_id": "formula-2021",
        "car_class": "Formula",
        "session_type": "Race simulation",
        "input_device": "controller",
        "laps": 12,
        "target_ms": 89800,
        "trend_ms": 45,
        "seed": DEMO_SEED,
        "date": "2026-08-08T18:42:00+00:00",
        "tyre_data": True,
    },
    {
        "id": "gt3-spa-practice",
        "title": "GT3 technique practice",
        "game_id": "generic_gt3",
        "game_label": "GT3 simulator",
        "track_id": "ardenne-circuit",
        "track_name": "Ardenne Circuit",
        "track_length_m": 7004.0,
        "car_id": "gt3-demo",
        "car_class": "GT3",
        "session_type": "Practice",
        "input_device": "wheel",
        "laps": 14,
        "target_ms": 139600,
        "trend_ms": -95,
        "seed": DEMO_SEED + 1,
        "date": "2026-08-05T16:10:00+00:00",
        "tyre_data": False,
    },
    {
        "id": "hypercar-endurance-stint",
        "title": "Hypercar long-run development",
        "game_id": "synthetic_endurance",
        "game_label": "Endurance prototype",
        "track_id": "la-sarthe-inspired",
        "track_name": "Mulsanne Endurance Loop",
        "track_length_m": 13626.0,
        "car_id": "hypercar-demo",
        "car_class": "Hypercar",
        "session_type": "Endurance stint",
        "input_device": "controller",
        "laps": 16,
        "target_ms": 211400,
        "trend_ms": 125,
        "seed": DEMO_SEED + 2,
        "date": "2026-07-29T19:30:00+00:00",
        "tyre_data": True,
    },
]


def _lap_status(config: dict, lap_number: int) -> tuple[bool, str, int]:
    invalid = {3} if config["id"].startswith("f1") else ({6} if "gt3" in config["id"] else {5, 13})
    anomalous = 9 if config["id"].startswith("f1") else (11 if "gt3" in config["id"] else 12)
    if lap_number in invalid:
        return False, "invalid", 900
    if lap_number == anomalous:
        return True, "anomalous", 1650
    return True, "clean", 0


def _telemetry_for_lap(config: dict, lap_number: int, lap_time_ms: int, rng: random.Random):
    count = 180
    length = config["track_length_m"]
    controller = config["input_device"] == "controller"
    corners = [0.12, 0.28, 0.46, 0.64, 0.82, 0.94]
    brake_shift = ((lap_number % 4) - 1.5) * (7.0 if controller else 3.5)
    pickup_delay = (lap_number % 3) * (5.0 if controller else 2.0)
    samples = []
    for index in range(count):
        frac = index / (count - 1)
        distance = frac * length
        corner_effect = 0.0
        brake = 0.0
        throttle = 1.0
        steering = 0.015 * math.sin(frac * math.tau * 2)
        for corner_index, centre_frac in enumerate(corners):
            centre = centre_frac * length
            scale = length * (0.012 + (corner_index % 2) * 0.003)
            offset = distance - centre
            gaussian = math.exp(-((offset / scale) ** 2))
            corner_effect += gaussian * (78 + (corner_index % 3) * 18)
            brake_start = centre - length * 0.026 + brake_shift
            brake_end = centre - length * 0.004
            if brake_start <= distance <= brake_end:
                phase = (distance - brake_start) / max(1, brake_end - brake_start)
                brake = max(brake, min(1.0, 0.35 + math.sin(phase * math.pi) * 0.63))
                throttle = min(throttle, 0.0)
            elif centre - length * 0.004 < distance < centre + length * 0.012 + pickup_delay:
                throttle = min(throttle, max(0.0, (distance - centre) / (length * 0.012)))
            steering += (
                math.sin((offset / scale) * math.pi)
                * gaussian
                * (0.62 if corner_index % 2 else -0.55)
            )
        noise = rng.gauss(0, 2.2 if controller else 1.1)
        speed = max(68, 318 - corner_effect + noise)
        if brake > 0:
            throttle = 0.0
        throttle = max(0.0, min(1.0, throttle + rng.gauss(0, 0.025 if controller else 0.012)))
        steering += rng.gauss(0, 0.022 if controller else 0.008)
        gear = max(1, min(8, int((speed - 25) / 38) + 1))
        timestamp = int(lap_number * 1_000_000 + frac * lap_time_ms)
        wear = 4.2 + lap_number * 1.25
        theta = frac * math.tau
        samples.append(
            {
                "schema_version": 1,
                "timestamp_ms": timestamp,
                "received_at_ms": timestamp + 8,
                "game_id": config["game_id"],
                "game_version": "2021" if config["game_id"] == "f1_2021" else "demo",
                "adapter_version": "0.1.0",
                "session_uid": f"demo-{config['id']}",
                "frame_id": (lap_number - 1) * count + index,
                "player_index": 0,
                "track_id": config["track_id"],
                "car_id": config["car_id"],
                "car_class": config["car_class"],
                "session_type": config["session_type"],
                "input_device": config["input_device"],
                "lap_number": lap_number,
                "lap_distance_m": round(distance, 2),
                "total_distance_m": round((lap_number - 1) * length + distance, 2),
                "current_lap_time_ms": round(frac * lap_time_ms, 1),
                "last_lap_time_ms": None,
                "sector": 1 if frac < 1 / 3 else 2 if frac < 2 / 3 else 3,
                "position_x": round(math.cos(theta) * (length / 7) + math.sin(theta * 3) * 190, 2),
                "position_y": 0.0,
                "position_z": round(math.sin(theta) * (length / 10) + math.cos(theta * 2) * 140, 2),
                "yaw": round(theta, 4),
                "pitch": 0.0,
                "roll": round(steering * 0.025, 4),
                "speed_kph": round(speed, 1),
                "throttle_0_1": round(throttle, 3),
                "brake_0_1": round(brake, 3),
                "steer_minus1_1": round(max(-1, min(1, steering)), 3),
                "clutch_0_1": 0.0,
                "gear": gear,
                "rpm": int(6200 + gear * 620 + throttle * 3800),
                "drs": bool(frac > 0.48 and frac < 0.58 and throttle > 0.95),
                "fuel_kg": round(max(0, 42 - ((lap_number - 1) + frac) * 1.7), 2),
                "tyre_wear": [round(wear + corner, 2) for corner in (0.2, 0.6, 0.0, 0.4)]
                if config["tyre_data"]
                else None,
                "tyre_temperatures": [
                    round(88 + corner_effect * 0.025 + corner, 1) for corner in (0, 1, 2, 1)
                ]
                if config["tyre_data"]
                else None,
                "surface_type": [0, 0, 0, 0],
                "lap_invalid": False,
                "packet_id": 6,
            }
        )
    return samples


def _build_session(config: dict) -> dict:
    rng = random.Random(config["seed"])
    laps = []
    for lap_number in range(1, config["laps"] + 1):
        valid, classification, anomaly_ms = _lap_status(config, lap_number)
        warmup_ms = max(0, 4 - lap_number) * 210
        trend_ms = config["trend_ms"] * (lap_number - 1)
        variation = int(rng.gauss(0, 175 if config["input_device"] == "controller" else 110))
        lap_time_ms = int(config["target_ms"] + warmup_ms + trend_ms + anomaly_ms + variation)
        telemetry = _telemetry_for_lap(config, lap_number, lap_time_ms, rng)
        sector_one = int(lap_time_ms * (0.318 + rng.uniform(-0.002, 0.002)))
        sector_two = int(lap_time_ms * (0.354 + rng.uniform(-0.002, 0.002)))
        sectors = [sector_one, sector_two, lap_time_ms - sector_one - sector_two]
        laps.append(
            {
                "id": f"{config['id']}-lap-{lap_number}",
                "lap_number": lap_number,
                "lap_time_ms": lap_time_ms,
                "sector_times_ms": sectors,
                "valid": valid,
                "classification": classification,
                "quality_score": 0.95 if valid else 0.35,
                "tyre_wear_pct": round(4.5 + lap_number * 1.25, 2) if config["tyre_data"] else None,
                "telemetry": telemetry,
            }
        )
    session = {
        "id": config["id"],
        "title": config["title"],
        "session_uid": f"demo-{config['id']}",
        "game_id": config["game_id"],
        "game_label": config["game_label"],
        "track_id": config["track_id"],
        "track_name": config["track_name"],
        "track_length_m": config["track_length_m"],
        "car_id": config["car_id"],
        "car_class": config["car_class"],
        "session_type": config["session_type"],
        "input_device": config["input_device"],
        "started_at": config["date"],
        "completed_at": (
            datetime.fromisoformat(config["date"]) + timedelta(minutes=55)
        ).isoformat(),
        "demo_data": True,
        "analysis_status": "analyzed",
        "laps": laps,
        "provenance": {
            "product_version": "0.1.0-alpha.1",
            "build": 1,
            "telemetry_schema_version": 1,
            "adapter_version": "0.1.0",
            "collector_version": "0.1.0-alpha.1",
            "analysis_version": "0.1.0",
            "prompt_version": "coach-v1",
            "git_sha": "local",
            "generated_at": "2026-08-09T00:00:00Z",
            "demo_seed": config["seed"],
        },
    }
    session.update(analyze_session(session))
    session["report"] = build_fallback_report(session)
    return session


def build_fallback_report(session: dict) -> dict:
    findings = session.get("findings", [])[:3]
    best = session.get("metrics", {}).get("pace", {}).get("best_lap_ms")
    consistency = session.get("metrics", {}).get("pace", {}).get("consistency_score")
    return {
        "id": f"report-{session['id']}",
        "session_id": session["id"],
        "mode": "rule_based",
        "label": "Rule-based coach",
        "session_summary": f"{len(session['laps'])} laps analyzed; best clean lap {best} ms with a {consistency}/100 consistency score.",
        "top_priorities": [
            {
                "title": finding["title"],
                "action": finding["recommended_action"],
                "confidence": finding["confidence"],
                "evidence_ids": [finding["id"]],
            }
            for finding in findings
        ],
        "what_improved": "The most repeatable clean laps preserve progressive control inputs after minimum speed.",
        "what_regressed": "The closing phase shows more variation."
        if session["metrics"]["stint"]["increasing_error_frequency"]
        else "No material regression is supported by this stint.",
        "next_stint_plan": "Complete five controlled laps: repeat the same initial brake markers, release progressively, and review only after the stint.",
        "confidence_summary": "High confidence in recorded lap-time metrics; technique findings use only comparable clean laps.",
        "limitations": session["metrics"]["pace"]["limitations"]
        + session["metrics"]["stint"]["limitations"],
        "evidence_references": [finding["id"] for finding in findings],
        "provenance": {
            "fallback_used": True,
            "model_id": None,
            "prompt_version": "coach-v1",
            "analysis_version": "0.1.0",
            "finding_ids": [finding["id"] for finding in findings],
            "tool_calls": [],
            "token_usage": None,
            "latency_ms": 0,
            "timestamp": "2026-08-09T00:00:00Z",
            "response_status": "complete",
            "git_sha": "local",
        },
    }


@lru_cache
def _cached_sessions() -> tuple[dict, ...]:
    return tuple(_build_session(config) for config in SESSION_CONFIGS)


def get_demo_sessions() -> list[dict]:
    return deepcopy(list(_cached_sessions()))


def get_demo_session(session_id: str) -> dict | None:
    return next((session for session in get_demo_sessions() if session["id"] == session_id), None)


def get_demo_report(report_id: str) -> dict | None:
    return next(
        (
            session["report"]
            for session in get_demo_sessions()
            if session["report"]["id"] == report_id
        ),
        None,
    )


def generated_at() -> str:
    return datetime.now(UTC).isoformat()
