from __future__ import annotations

from copy import deepcopy

import pytest

from lapsignal.ai import generate_with_fallback
from lapsignal.analytics import analyze_session
from lapsignal.database import SessionLocal
from lapsignal.demo import build_fallback_report, get_demo_sessions

SCENARIOS = [
    "early_braking",
    "late_braking_poor_exit",
    "inconsistent_brake_release",
    "late_throttle_pickup",
    "excessive_throttle_modulation",
    "consistent_but_slow",
    "one_anomalous_clean_lap",
    "invalid_lap_contamination",
    "controller_input_noise",
    "stint_degradation",
    "missing_tyre_data",
    "insufficient_clean_laps",
]


@pytest.mark.asyncio
async def test_cloud_coach_requires_explicit_server_consent():
    with SessionLocal() as db:
        report = await generate_with_fallback(
            db, get_demo_sessions()[0], {"ai_consent": False, "cloud_ai_enabled": True}
        )
    assert report["label"] == "Rule-based coaching"
    assert report["provenance"]["provider"] == "rule_based"


def _scenario(name: str) -> dict:
    session = deepcopy(get_demo_sessions()[0])
    session["id"] = f"eval-{name}"
    if name == "invalid_lap_contamination":
        session["laps"][1]["valid"] = False
        session["laps"][1]["lap_time_ms"] = 60_000
    elif name == "one_anomalous_clean_lap":
        session["laps"][4]["lap_time_ms"] += 8_000
    elif name == "stint_degradation":
        for index, lap in enumerate(session["laps"]):
            lap["lap_time_ms"] += index * 260
    elif name == "missing_tyre_data":
        for lap in session["laps"]:
            lap["tyre_wear_pct"] = None
    elif name == "insufficient_clean_laps":
        for lap in session["laps"][1:]:
            lap["valid"] = False
    elif name == "controller_input_noise":
        session["input_device"] = "controller"
        for lap in session["laps"]:
            for index, sample in enumerate(lap["telemetry"]):
                sample["steer_minus1_1"] = max(
                    -1, min(1, sample["steer_minus1_1"] + (-0.08 if index % 2 else 0.08))
                )
    elif name in {
        "late_throttle_pickup",
        "late_braking_poor_exit",
        "excessive_throttle_modulation",
    }:
        for lap in session["laps"]:
            for index, sample in enumerate(lap["telemetry"]):
                if name == "excessive_throttle_modulation" and sample["throttle_0_1"] > 0.2:
                    sample["throttle_0_1"] = 0.55 if index % 2 else 0.9
                elif name != "excessive_throttle_modulation" and index % 30 < 5:
                    sample["throttle_0_1"] = 0.0
    session.update(analyze_session(session))
    session["report"] = build_fallback_report(session)
    return session


@pytest.mark.parametrize("name", SCENARIOS)
def test_evaluation_scenario_has_grounded_output(name: str):
    session = _scenario(name)
    report = session["report"]
    finding_ids = {finding["id"] for finding in session["findings"]}
    assert len(report["top_priorities"]) <= 3
    assert set(report["evidence_references"]).issubset(finding_ids)
    assert all(priority["evidence_ids"] for priority in report["top_priorities"])
    assert "guarantee" not in str(report).lower()
    if session["input_device"] == "controller":
        assert "wheel-specific" not in str(report).lower()
    if name == "missing_tyre_data":
        assert any("Tyre-wear" in item for item in report["limitations"])
    if name == "insufficient_clean_laps":
        assert report["limitations"]
