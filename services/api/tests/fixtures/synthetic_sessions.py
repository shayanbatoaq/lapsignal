from __future__ import annotations

import math
import random
from copy import deepcopy
from datetime import datetime, timedelta
from functools import lru_cache

from lapsignal.analytics import analyze_session
from lapsignal.coach import build_rule_based_report

FIXTURE_SEED = 20210809
CONFIGS = (
    {
        "id": "synthetic-controller-silverstone",
        "game_id": "f1_2021",
        "track_id": "silverstone",
        "track_name": "Silverstone",
        "track_length_m": 5891.0,
        "car_id": "formula-test",
        "car_class": "Formula",
        "session_type": "Race simulation",
        "input_device": "controller",
        "laps": 12,
        "target_ms": 89_800,
        "trend_ms": 45,
        "seed": FIXTURE_SEED,
    },
    {
        "id": "synthetic-wheel-spa",
        "game_id": "test_gt3",
        "track_id": "spa-francorchamps",
        "track_name": "Spa-Francorchamps",
        "track_length_m": 7004.0,
        "car_id": "gt3-test",
        "car_class": "GT3",
        "session_type": "Practice",
        "input_device": "wheel",
        "laps": 14,
        "target_ms": 139_600,
        "trend_ms": -95,
        "seed": FIXTURE_SEED + 1,
    },
    {
        "id": "synthetic-endurance-stint",
        "game_id": "test_endurance",
        "track_id": "test-endurance-loop",
        "track_name": "Test Endurance Loop",
        "track_length_m": 13_626.0,
        "car_id": "prototype-test",
        "car_class": "Hypercar",
        "session_type": "Endurance stint",
        "input_device": "controller",
        "laps": 16,
        "target_ms": 211_400,
        "trend_ms": 125,
        "seed": FIXTURE_SEED + 2,
    },
)


def _sample_rows(config: dict, lap_number: int, lap_time_ms: int, rng: random.Random) -> list[dict]:
    count = 180
    length = config["track_length_m"]
    controller = config["input_device"] == "controller"
    rows = []
    for index in range(count):
        fraction = index / (count - 1)
        distance = fraction * length
        brake = 0.0
        throttle = 1.0
        steering = 0.015 * math.sin(fraction * math.tau * 2)
        corner_effect = 0.0
        for corner_index, centre_fraction in enumerate((0.12, 0.28, 0.46, 0.64, 0.82, 0.94)):
            centre = centre_fraction * length
            scale = length * (0.012 + (corner_index % 2) * 0.003)
            offset = distance - centre
            gaussian = math.exp(-((offset / scale) ** 2))
            corner_effect += gaussian * (78 + (corner_index % 3) * 18)
            brake_start = centre - length * 0.026 + ((lap_number % 4) - 1.5) * 7
            brake_end = centre - length * 0.004
            if brake_start <= distance <= brake_end:
                phase = (distance - brake_start) / max(1, brake_end - brake_start)
                brake = max(brake, min(1.0, 0.35 + math.sin(phase * math.pi) * 0.63))
                throttle = 0.0
            elif brake_end < distance < centre + length * 0.012:
                throttle = min(throttle, max(0.0, (distance - centre) / (length * 0.012)))
            steering += (
                math.sin((offset / scale) * math.pi)
                * gaussian
                * (0.62 if corner_index % 2 else -0.55)
            )
        speed = max(68, 318 - corner_effect + rng.gauss(0, 2.2 if controller else 1.1))
        gear = max(1, min(8, int((speed - 25) / 38) + 1))
        timestamp = int(lap_number * 1_000_000 + fraction * lap_time_ms)
        rows.append(
            {
                "schema_version": 1,
                "timestamp_ms": timestamp,
                "received_at_ms": timestamp + 8,
                "game_id": config["game_id"],
                "game_version": "test",
                "packet_format": 2021,
                "adapter_version": "0.1.0",
                "session_uid": f"fixture-{config['id']}",
                "frame_id": (lap_number - 1) * count + index,
                "player_index": 0,
                "game_track_id": 7,
                "track_id": config["track_id"],
                "track_name": config["track_name"],
                "track_length_m": length,
                "car_id": config["car_id"],
                "car_class": config["car_class"],
                "session_type": config["session_type"],
                "input_device": config["input_device"],
                "lap_number": lap_number,
                "lap_distance_m": round(distance, 2),
                "total_distance_m": round((lap_number - 1) * length + distance, 2),
                "current_lap_time_ms": round(fraction * lap_time_ms, 1),
                "last_lap_time_ms": None,
                "sector": 1 if fraction < 1 / 3 else 2 if fraction < 2 / 3 else 3,
                "position_x": round(math.cos(fraction * math.tau) * 500, 2),
                "position_y": 0.0,
                "position_z": round(math.sin(fraction * math.tau) * 350, 2),
                "yaw": round(fraction * math.tau, 4),
                "pitch": 0.0,
                "roll": 0.0,
                "speed_kph": round(speed, 1),
                "throttle_0_1": round(throttle, 3),
                "brake_0_1": round(brake, 3),
                "steer_minus1_1": round(max(-1, min(1, steering)), 3),
                "clutch_0_1": 0.0,
                "gear": gear,
                "rpm": int(6200 + gear * 620 + throttle * 3800),
                "drs": False,
                "fuel_kg": 20.0,
                "tyre_wear": [5.0, 5.0, 5.0, 5.0],
                "tyre_temperatures": [88.0, 89.0, 90.0, 89.0],
                "surface_type": [0, 0, 0, 0],
                "lap_invalid": False,
                "packet_id": 6,
            }
        )
    return rows


def _build_session(config: dict) -> dict:
    rng = random.Random(config["seed"])
    laps = []
    for lap_number in range(1, config["laps"] + 1):
        valid = lap_number not in ({3} if config["id"].endswith("silverstone") else {6})
        anomaly = 1650 if lap_number in {9, 11, 12} else 0
        lap_time_ms = int(
            config["target_ms"]
            + config["trend_ms"] * (lap_number - 1)
            + anomaly
            + rng.gauss(0, 150)
        )
        sector_one = int(lap_time_ms * 0.318)
        sector_two = int(lap_time_ms * 0.354)
        laps.append(
            {
                "id": f"{config['id']}-lap-{lap_number}",
                "lap_number": lap_number,
                "lap_time_ms": lap_time_ms,
                "sector_times_ms": [sector_one, sector_two, lap_time_ms - sector_one - sector_two],
                "valid": valid,
                "classification": "clean" if valid else "invalid",
                "quality_score": 0.95 if valid else 0.35,
                "tyre_wear_pct": 4.5 + lap_number,
                "telemetry": _sample_rows(config, lap_number, lap_time_ms, rng),
            }
        )
    started = datetime(2000, 1, 1)
    session = {
        "id": config["id"],
        "title": f"{config['track_name']} synthetic fixture",
        "session_uid": f"fixture-{config['id']}",
        "game_id": config["game_id"],
        "game_label": "Synthetic test game",
        "track_id": config["track_id"],
        "track_name": config["track_name"],
        "track_length_m": config["track_length_m"],
        "car_id": config["car_id"],
        "car_class": config["car_class"],
        "session_type": config["session_type"],
        "input_device": config["input_device"],
        "started_at": started.isoformat(),
        "completed_at": (started + timedelta(minutes=45)).isoformat(),
        "analysis_status": "analyzed",
        "laps": laps,
        "provenance": {"source": "isolated_test_fixture", "fixture_seed": config["seed"]},
    }
    session.update(analyze_session(session))
    session["report"] = build_rule_based_report(session)
    return session


@lru_cache
def _cached_sessions() -> tuple[dict, ...]:
    return tuple(_build_session(config) for config in CONFIGS)


def get_synthetic_sessions() -> list[dict]:
    return deepcopy(list(_cached_sessions()))
