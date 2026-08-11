from __future__ import annotations

import math
from collections.abc import Iterable
from statistics import mean, median, pstdev

import numpy as np

ANALYSIS_VERSION = "0.1.0"


def resample_by_distance(
    samples: list[dict], points: int = 200, max_gap_m: float = 80.0
) -> tuple[list[dict], list[str]]:
    """Align one lap by distance while retaining visible large-gap limitations."""
    valid = sorted(
        [s for s in samples if s.get("lap_distance_m") is not None],
        key=lambda s: s["lap_distance_m"],
    )
    if len(valid) < 3:
        return [], ["Insufficient distance samples for alignment."]
    distances = np.asarray([s["lap_distance_m"] for s in valid], dtype=float)
    target = np.linspace(float(distances[0]), float(distances[-1]), points)
    gaps = np.diff(distances)
    limitations = []
    if gaps.size and float(np.max(gaps)) > max_gap_m:
        limitations.append(f"A telemetry gap exceeds {max_gap_m:.0f} m; comparison quality is low.")
    channels = [
        "speed_kph",
        "throttle_0_1",
        "brake_0_1",
        "steer_minus1_1",
        "gear",
        "rpm",
        "current_lap_time_ms",
    ]
    output = []
    for distance in target:
        row = {"lap_distance_m": round(float(distance), 2)}
        for channel in channels:
            values = np.asarray(
                [np.nan if s.get(channel) is None else s[channel] for s in valid], dtype=float
            )
            mask = ~np.isnan(values)
            row[channel] = (
                round(float(np.interp(distance, distances[mask], values[mask])), 4)
                if mask.sum() >= 2
                else None
            )
        output.append(row)
    return output, limitations


def clean_laps(laps: Iterable[dict]) -> list[dict]:
    return [
        lap
        for lap in laps
        if lap.get("valid")
        and lap.get("classification") not in {"pit", "out", "in", "incomplete", "corrupted"}
        and isinstance(lap.get("lap_time_ms"), (int, float))
        and 30_000 <= lap["lap_time_ms"] <= 600_000
    ]


def coachable_laps(laps: Iterable[dict]) -> list[dict]:
    """Return attempts with enough reliable channels for technique analysis, regardless of timing validity."""
    return [
        lap
        for lap in laps
        if lap.get("classification") not in {"pit", "out", "in", "corrupted"}
        and len(lap.get("telemetry", [])) >= 20
        and sum(
            sample.get("lap_distance_m") is not None
            and any(
                sample.get(channel) is not None
                for channel in ("brake_0_1", "throttle_0_1", "steer_minus1_1")
            )
            for sample in lap.get("telemetry", [])
        )
        >= 15
    ]


def robust_consistency_score(lap_times_ms: list[float]) -> float:
    if len(lap_times_ms) < 2:
        return 0.0
    centre = median(lap_times_ms)
    mad = median(abs(value - centre) for value in lap_times_ms)
    score = 100 - (mad / max(centre, 1)) * 2200
    return round(max(0.0, min(100.0, score)), 1)


def pace_metrics(laps: list[dict]) -> dict:
    clean = clean_laps(laps)
    times = [float(lap["lap_time_ms"]) for lap in clean]
    if not times:
        return {
            "clean_laps": 0,
            "best_lap_ms": None,
            "median_lap_ms": None,
            "mean_lap_ms": None,
            "std_dev_ms": None,
            "consistency_score": 0,
            "theoretical_best_ms": None,
            "pace_degradation_ms_per_lap": None,
            "limitations": ["No complete clean laps are available."],
        }
    sector_rows = [lap.get("sector_times_ms") for lap in clean if lap.get("sector_times_ms")]
    theoretical = (
        sum(min(row[i] for row in sector_rows) for i in range(3)) if sector_rows else min(times)
    )
    slope = float(np.polyfit(np.arange(len(times)), times, 1)[0]) if len(times) >= 3 else None
    limitations = [] if len(times) >= 3 else ["At least three clean laps are needed for a trend."]
    return {
        "clean_laps": len(clean),
        "best_lap_ms": int(min(times)),
        "median_lap_ms": int(median(times)),
        "mean_lap_ms": round(mean(times), 1),
        "std_dev_ms": round(pstdev(times), 1) if len(times) > 1 else 0.0,
        "consistency_score": robust_consistency_score(times),
        "theoretical_best_ms": int(theoretical),
        "pace_degradation_ms_per_lap": round(slope, 1) if slope is not None else None,
        "limitations": limitations,
    }


def _zones(samples: list[dict], threshold: float = 0.12) -> list[list[dict]]:
    zones: list[list[dict]] = []
    active: list[dict] = []
    for sample in samples:
        if (sample.get("brake_0_1") or 0) >= threshold:
            active.append(sample)
        elif active:
            if len(active) >= 3:
                zones.append(active)
            active = []
    if len(active) >= 3:
        zones.append(active)
    return zones


def braking_metrics(lap: dict) -> list[dict]:
    metrics = []
    samples = lap.get("telemetry", [])
    for index, zone in enumerate(_zones(samples), start=1):
        pressures = np.asarray([sample.get("brake_0_1") or 0 for sample in zone])
        distances = [sample["lap_distance_m"] for sample in zone]
        speed = [sample.get("speed_kph") or 0 for sample in zone]
        release = np.diff(pressures[len(pressures) // 2 :]) if len(pressures) > 4 else np.array([])
        duration = max(0, (zone[-1]["timestamp_ms"] - zone[0]["timestamp_ms"]) / 1000)
        metrics.append(
            {
                "zone_id": f"zone-{index}",
                "brake_onset_distance_m": round(float(distances[0]), 1),
                "initial_pressure": round(float(pressures[0]), 3),
                "peak_pressure": round(float(np.max(pressures)), 3),
                "duration_s": round(duration, 3),
                "release_smoothness": round(float(1 / (1 + np.std(release) * 10)), 3)
                if release.size
                else 0.5,
                "trail_braking_proxy": round(
                    float(np.mean(pressures[-max(2, len(pressures) // 3) :])), 3
                ),
                "minimum_speed_kph": round(float(min(speed)), 1),
            }
        )
    return metrics


def throttle_metrics(lap: dict) -> dict:
    samples = lap.get("telemetry", [])
    if not samples:
        return {"pickup_distance_m": None, "time_to_full_s": None, "modulation": None}
    min_speed_index = min(
        range(len(samples)), key=lambda i: samples[i].get("speed_kph") or math.inf
    )
    after = samples[min_speed_index:]
    pickup = next((s for s in after if (s.get("throttle_0_1") or 0) >= 0.2), None)
    full = next((s for s in after if (s.get("throttle_0_1") or 0) >= 0.95), None)
    modulation = np.diff([s.get("throttle_0_1") or 0 for s in after])
    return {
        "pickup_distance_m": pickup.get("lap_distance_m") if pickup else None,
        "time_to_full_s": round((full["timestamp_ms"] - pickup["timestamp_ms"]) / 1000, 3)
        if pickup and full
        else None,
        "modulation": round(float(np.sum(np.abs(modulation))), 3) if modulation.size else 0.0,
    }


def steering_metrics(lap: dict, input_device: str) -> dict:
    values = np.asarray([s.get("steer_minus1_1") or 0 for s in lap.get("telemetry", [])])
    if values.size < 3:
        return {"smoothness": None, "correction_count": None, "abrupt_changes": None}
    derivative = np.diff(values)
    threshold = 0.18 if input_device == "controller" else 0.1
    return {
        "smoothness": round(float(1 / (1 + np.std(derivative) * 8)), 3),
        "correction_count": int(np.sum(np.diff(np.sign(derivative)) != 0)),
        "abrupt_changes": int(np.sum(np.abs(derivative) > threshold)),
        "limitation": "Input smoothness is device-aware and is not a vehicle-balance diagnosis.",
    }


def stint_metrics(laps: list[dict]) -> dict:
    clean = clean_laps(laps)
    pace = pace_metrics(laps)
    times = [lap["lap_time_ms"] for lap in clean]
    split = max(1, len(times) // 3)
    phase_consistency = {
        "opening": robust_consistency_score(times[:split]),
        "middle": robust_consistency_score(times[split : split * 2]),
        "closing": robust_consistency_score(times[split * 2 :]),
    }
    wear = [lap.get("tyre_wear_pct") for lap in clean]
    if any(value is None for value in wear) or len(wear) < 3:
        tyre_correlation = None
        limitation = (
            "Tyre-wear correlation is unavailable because the channel is missing or sparse."
        )
    else:
        tyre_correlation = round(float(np.corrcoef(wear, times)[0, 1]), 3)
        limitation = None
    degradation = pace.get("pace_degradation_ms_per_lap") or 0
    return {
        "pace_degradation_ms_per_lap": degradation,
        "phase_consistency": phase_consistency,
        "tyre_wear_correlation": tyre_correlation,
        "increasing_error_frequency": phase_consistency["closing"]
        < phase_consistency["opening"] - 3,
        "long_run_stability_score": round(
            max(0, min(100, pace["consistency_score"] - max(0, degradation) / 40)), 1
        ),
        "limitations": [limitation] if limitation else [],
    }


def build_findings(session: dict, metrics: dict) -> list[dict]:
    clean = clean_laps(session["laps"])
    coachable = coachable_laps(session["laps"])
    if not coachable:
        return []
    invalid_attempts = [lap for lap in coachable if not lap.get("valid")]
    best = min(clean, key=lambda lap: lap["lap_time_ms"]) if clean else coachable[0]
    representative = (
        invalid_attempts[-1]
        if invalid_attempts
        else sorted(clean, key=lambda lap: lap["lap_time_ms"])[len(clean) // 2]
    )
    findings: list[dict] = []
    if clean and metrics["pace"]["consistency_score"] < 98.5:
        findings.append(
            {
                "id": f"{session['id']}-consistency",
                "type": "lap_variation",
                "priority": 1,
                "severity": "medium",
                "confidence": 0.91,
                "title": "Stabilize the repeatable lap first",
                "plain_language": "Your clean-lap spread is wider than the strongest phase of this stint.",
                "recommended_action": "Run five laps at a controlled pace and repeat the same brake markers before adding pace.",
                "evidence": [
                    {
                        "metric": "consistency_score",
                        "value": metrics["pace"]["consistency_score"],
                        "unit": "score_0_100",
                        "reference_value": 99.0,
                        "delta": round(metrics["pace"]["consistency_score"] - 99.0, 1),
                        "lap_numbers": [lap["lap_number"] for lap in clean],
                        "zone_id": None,
                    }
                ],
                "limitations": [],
                "analysis_version": ANALYSIS_VERSION,
            }
        )
    best_zones = braking_metrics(best)
    rep_zones = braking_metrics(representative)
    if best_zones and rep_zones:
        delta = rep_zones[0]["brake_onset_distance_m"] - best_zones[0]["brake_onset_distance_m"]
        if abs(delta) >= 3:
            later_or_earlier = "later" if delta < 0 else "earlier"
            direction = "Delay" if delta < 0 else "Hold"
            findings.append(
                {
                    "id": f"{session['id']}-braking-zone-1",
                    "type": f"braking_{later_or_earlier}",
                    "priority": 2,
                    "severity": "medium",
                    "confidence": 0.86,
                    "title": "Make Zone 1 braking more repeatable",
                    "plain_language": f"The representative lap begins braking {abs(delta):.1f} m {later_or_earlier} than your best clean lap.",
                    "recommended_action": f"{direction} the initial application near the best-lap marker, then preserve the same peak pressure.",
                    "evidence": [
                        {
                            "metric": "brake_onset_distance",
                            "value": rep_zones[0]["brake_onset_distance_m"],
                            "unit": "lap_distance_m",
                            "reference_value": best_zones[0]["brake_onset_distance_m"],
                            "delta": round(delta, 1),
                            "lap_numbers": [representative["lap_number"], best["lap_number"]],
                            "zone_id": "zone-1",
                        }
                    ],
                    "limitations": [
                        "The comparison uses the personal-best clean lap, not an external ideal lap."
                    ],
                    "analysis_version": ANALYSIS_VERSION,
                }
            )
    throttle = throttle_metrics(representative)
    best_throttle = throttle_metrics(best)
    if throttle["pickup_distance_m"] and best_throttle["pickup_distance_m"]:
        pickup_delta = throttle["pickup_distance_m"] - best_throttle["pickup_distance_m"]
        if pickup_delta >= 4:
            findings.append(
                {
                    "id": f"{session['id']}-throttle-pickup",
                    "type": "late_throttle_pickup",
                    "priority": 3,
                    "severity": "low",
                    "confidence": 0.82,
                    "title": "Reconnect to throttle sooner on exit",
                    "plain_language": "Throttle pickup occurs later than on your best comparable lap.",
                    "recommended_action": "Use one progressive application after minimum speed and avoid a second lift unless grip requires it.",
                    "evidence": [
                        {
                            "metric": "throttle_pickup_distance",
                            "value": throttle["pickup_distance_m"],
                            "unit": "lap_distance_m",
                            "reference_value": best_throttle["pickup_distance_m"],
                            "delta": round(pickup_delta, 1),
                            "lap_numbers": [representative["lap_number"], best["lap_number"]],
                            "zone_id": "zone-1-exit",
                        }
                    ],
                    "limitations": [],
                    "analysis_version": ANALYSIS_VERSION,
                }
            )
    if not representative.get("valid"):
        invalid_limitation = (
            "Invalid lap time is excluded from personal-best and clean benchmark comparisons."
        )
        if best_zones and not any(finding["type"].startswith("braking") for finding in findings):
            zone = best_zones[0]
            findings.append(
                {
                    "id": f"{session['id']}-invalid-braking",
                    "type": "invalid_attempt_braking",
                    "priority": len(findings) + 1,
                    "severity": "low",
                    "confidence": 0.82,
                    "title": "Keep the braking reference from this attempt",
                    "plain_language": "This lap will not count as a personal best, but its braking trace is still usable for coaching.",
                    "recommended_action": "Repeat the same initial brake reference and focus on a progressive release before adding pace.",
                    "evidence": [
                        {
                            "metric": "invalid_attempt_peak_brake",
                            "value": zone["peak_pressure"],
                            "unit": "ratio_0_1",
                            "reference_value": None,
                            "delta": None,
                            "lap_numbers": [representative["lap_number"]],
                            "zone_id": zone["zone_id"],
                        }
                    ],
                    "limitations": [invalid_limitation],
                    "analysis_version": ANALYSIS_VERSION,
                }
            )
        if len(findings) < 3 and throttle.get("modulation") is not None:
            findings.append(
                {
                    "id": f"{session['id']}-invalid-throttle",
                    "type": "invalid_attempt_throttle",
                    "priority": len(findings) + 1,
                    "severity": "low",
                    "confidence": 0.79,
                    "title": "Use the throttle trace even though timing is excluded",
                    "plain_language": "The lap was invalidated, so its final time is excluded. Throttle application can still be analysed.",
                    "recommended_action": "Aim for one progressive application after minimum speed and reduce avoidable second lifts.",
                    "evidence": [
                        {
                            "metric": "invalid_attempt_throttle_modulation",
                            "value": throttle["modulation"],
                            "unit": "absolute_input_change",
                            "reference_value": None,
                            "delta": None,
                            "lap_numbers": [representative["lap_number"]],
                            "zone_id": None,
                        }
                    ],
                    "limitations": [invalid_limitation],
                    "analysis_version": ANALYSIS_VERSION,
                }
            )
        steering = steering_metrics(representative, session["input_device"])
        if len(findings) < 3 and steering.get("smoothness") is not None:
            findings.append(
                {
                    "id": f"{session['id']}-invalid-steering",
                    "type": "invalid_attempt_steering",
                    "priority": len(findings) + 1,
                    "severity": "low",
                    "confidence": 0.78,
                    "title": "Preserve the useful steering evidence",
                    "plain_language": "Official timing is excluded, but steering smoothness remains measurable on this attempt.",
                    "recommended_action": "Repeat the corner with one deliberate steering input and unwind progressively on exit.",
                    "evidence": [
                        {
                            "metric": "invalid_attempt_steering_smoothness",
                            "value": steering["smoothness"],
                            "unit": "score_0_1",
                            "reference_value": None,
                            "delta": None,
                            "lap_numbers": [representative["lap_number"]],
                            "zone_id": None,
                        }
                    ],
                    "limitations": [invalid_limitation, steering["limitation"]],
                    "analysis_version": ANALYSIS_VERSION,
                }
            )
    degradation = metrics["stint"]["pace_degradation_ms_per_lap"]
    if degradation and degradation > 70 and len(findings) < 3:
        findings.append(
            {
                "id": f"{session['id']}-degradation",
                "type": "stint_degradation",
                "priority": len(findings) + 1,
                "severity": "medium",
                "confidence": 0.84,
                "title": "Protect closing-stint execution",
                "plain_language": "Clean-lap pace trends slower through this stint.",
                "recommended_action": "Target stable inputs for the final third and compare the same corners after the run.",
                "evidence": [
                    {
                        "metric": "pace_degradation_slope",
                        "value": degradation,
                        "unit": "ms_per_lap",
                        "reference_value": 0,
                        "delta": degradation,
                        "lap_numbers": [lap["lap_number"] for lap in clean],
                        "zone_id": None,
                    }
                ],
                "limitations": [
                    "This is a descriptive performance pattern, not a medical fatigue conclusion."
                ],
                "analysis_version": ANALYSIS_VERSION,
            }
        )
    return sorted(findings, key=lambda finding: finding["priority"])[:3]


def analyze_session(session: dict) -> dict:
    coachable = coachable_laps(session["laps"])
    invalid_attempts = [lap for lap in coachable if not lap.get("valid")]
    representative = (
        invalid_attempts[-1]
        if invalid_attempts
        else (coachable[len(coachable) // 2] if coachable else None)
    )
    pace = pace_metrics(session["laps"])
    metrics = {
        "pace": pace,
        "stint": stint_metrics(session["laps"]),
        "braking": braking_metrics(representative) if representative else [],
        "throttle": throttle_metrics(representative) if representative else {},
        "steering": steering_metrics(representative, session["input_device"])
        if representative
        else {},
    }
    findings = build_findings(session, metrics)
    return {"metrics": metrics, "findings": findings, "analysis_version": ANALYSIS_VERSION}
