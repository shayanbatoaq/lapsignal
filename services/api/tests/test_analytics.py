from __future__ import annotations

from copy import deepcopy

from lapsignal.analytics import (
    analyze_session,
    braking_metrics,
    clean_laps,
    pace_metrics,
    resample_by_distance,
    robust_consistency_score,
    throttle_metrics,
)
from tests.fixtures.synthetic_sessions import get_synthetic_sessions


def test_invalid_laps_are_excluded():
    session = get_synthetic_sessions()[0]
    assert len(clean_laps(session["laps"])) < len(session["laps"])


def test_invalid_laps_keep_technique_coaching_but_never_set_personal_best():
    session = deepcopy(get_synthetic_sessions()[0])
    for lap in session["laps"]:
        lap["valid"] = False
        lap["classification"] = "invalid"
        for sample in lap["telemetry"]:
            sample["lap_invalid"] = True
    result = analyze_session(session)
    assert result["metrics"]["pace"]["best_lap_ms"] is None
    assert result["metrics"]["pace"]["clean_laps"] == 0
    assert result["metrics"]["braking"]
    assert result["metrics"]["throttle"]
    assert result["metrics"]["steering"]
    assert result["findings"]
    assert all(
        "Invalid lap time is excluded" in " ".join(item["limitations"])
        for item in result["findings"]
    )


def test_distance_alignment_preserves_channels():
    lap = get_synthetic_sessions()[0]["laps"][0]
    aligned, limitations = resample_by_distance(lap["telemetry"], points=100)
    assert len(aligned) == 100
    assert aligned[0]["lap_distance_m"] == 0
    assert aligned[-1]["speed_kph"] is not None
    assert not limitations


def test_large_gap_is_disclosed():
    lap = get_synthetic_sessions()[0]["laps"][0]
    sparse = lap["telemetry"][:20] + lap["telemetry"][60:]
    _, limitations = resample_by_distance(sparse, max_gap_m=80)
    assert limitations


def test_theoretical_best_does_not_exceed_best_lap():
    pace = pace_metrics(get_synthetic_sessions()[0]["laps"])
    assert pace["theoretical_best_ms"] <= pace["best_lap_ms"]


def test_consistency_penalizes_anomaly():
    stable = robust_consistency_score([90_000, 90_020, 90_040, 90_010])
    spread = robust_consistency_score([90_000, 91_500, 92_000, 89_900])
    assert stable > spread


def test_braking_zone_detection_and_throttle_pickup():
    lap = get_synthetic_sessions()[0]["laps"][0]
    assert len(braking_metrics(lap)) >= 4
    assert throttle_metrics(lap)["pickup_distance_m"] is not None


def test_degradation_slope_detects_long_run_trend():
    session = get_synthetic_sessions()[2]
    assert analyze_session(session)["metrics"]["stint"]["pace_degradation_ms_per_lap"] > 0


def test_missing_channels_return_limitations_not_claims():
    session = deepcopy(get_synthetic_sessions()[1])
    for lap in session["laps"]:
        lap["tyre_wear_pct"] = None
    result = analyze_session(session)
    assert result["metrics"]["stint"]["tyre_wear_correlation"] is None
    assert result["metrics"]["stint"]["limitations"]
