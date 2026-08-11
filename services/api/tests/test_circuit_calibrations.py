from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from lapsignal.circuit_calibrations import CircuitCalibrationRepository


def test_built_in_seed_loads_immediately_then_upgrades_positioning(tmp_path: Path):
    _write_seed(tmp_path, _artifact(seed=True, quality_score=105))
    repository = CircuitCalibrationRepository(tmp_path)
    waiting = repository.status_for(
        {**_sample(), "lap_distance_m": None, "position_x": None, "position_z": None, "yaw": None}
    )
    assert waiting["label"] == "Built-in map"
    assert waiting["map_source"] == "built_in"
    distance = repository.status_for(
        {**_sample(), "position_x": None, "position_z": None, "yaw": None}
    )
    assert distance["state"] == "distance_projected"
    world = repository.status_for(_sample())
    assert world["state"] == "world_calibrated"
    assert world["calibration"]["game_track_id"] == 20


def test_telemetry_seed_remains_highest_quality_even_with_local_candidate(tmp_path: Path):
    _write_seed(tmp_path, _artifact(seed=True, quality_score=104))
    _write_local(tmp_path, _artifact(seed=False, quality_score=103))
    repository = CircuitCalibrationRepository(tmp_path)
    assert repository.status_for(_sample())["map_source"] == "built_in"

    _write_local(tmp_path, _artifact(seed=False, quality_score=106))
    repository = CircuitCalibrationRepository(tmp_path)
    assert repository.status_for(_sample())["map_source"] == "built_in"


def test_legacy_local_quality_is_normalized_before_seed_comparison(tmp_path: Path):
    seed = _artifact(seed=True, quality_score=0)
    local = _artifact(seed=False, quality_score=0)
    first, last = seed["points"][0], seed["points"][-1]
    seed["quality"]["closure_distance_svg"] = math.hypot(
        first["x"] - last["x"], first["y"] - last["y"]
    )
    seed["quality"].pop("quality_score")
    local["quality"].pop("quality_score")
    local["quality"].pop("closure_distance_svg")
    _write_seed(tmp_path, seed)
    _write_local(tmp_path, local)

    assert CircuitCalibrationRepository(tmp_path).status_for(_sample())["map_source"] == (
        "built_in"
    )


def test_progressive_partial_map_is_not_presented_as_complete_geometry(tmp_path: Path):
    directory = tmp_path / "local" / "circuit-calibrations"
    directory.mkdir(parents=True)
    partial = _artifact(seed=False, quality_score=40)
    partial.update(
        {
            "positioning_mode": "partial",
            "geometry_kind": "telemetry_derived_partial",
            "is_closed": False,
            "segments": [partial["points"][:40]],
            "points": partial["points"][:40],
        }
    )
    partial["geometry_checksum"] = _checksum(partial["points"])
    progress = {
        "schema_version": 2,
        "state": "learning",
        "layout_fingerprint": "f1_2021:2021:20:5994",
        "game_id": "f1_2021",
        "packet_format": 2021,
        "game_track_id": 20,
        "track_name": "Baku",
        "progress": 0.5,
        "partial_calibration": partial,
    }
    (directory / "f1_2021-2021-20-5994.progress.json").write_text(
        json.dumps(progress), encoding="utf-8"
    )
    first = CircuitCalibrationRepository(tmp_path).status_for(_sample())
    restarted = CircuitCalibrationRepository(tmp_path).status_for(_sample())
    assert first["state"] == "unavailable"
    assert first["map_source"] == "none"
    assert first["calibration"] is None
    assert restarted == first


def test_track_or_length_mismatch_never_reuses_geometry(tmp_path: Path):
    _write_seed(tmp_path, _artifact(seed=True, quality_score=105))
    repository = CircuitCalibrationRepository(tmp_path)
    spa = {
        **_sample(),
        "game_track_id": 10,
        "track_id": "spa-francorchamps",
        "track_length_m": 7003,
    }
    assert repository.status_for(spa)["calibration"] is None
    assert repository.status_for({**_sample(), "track_length_m": 6004})["calibration"] is None


def test_reset_removes_only_local_refinement_and_preserves_seed(tmp_path: Path):
    _write_seed(tmp_path, _artifact(seed=True, quality_score=104))
    _write_local(tmp_path, _artifact(seed=False, quality_score=106))
    progress_path = (
        tmp_path / "local" / "circuit-calibrations" / "f1_2021-2021-20-5994.progress.json"
    )
    progress_path.write_text(
        json.dumps({"layout_fingerprint": "f1_2021:2021:20:5994", "progress": 0.2}),
        encoding="utf-8",
    )
    repository = CircuitCalibrationRepository(tmp_path)
    result = repository.reset_local("f1_2021:2021:20:5994")
    assert result == {
        "layout_fingerprint": "f1_2021:2021:20:5994",
        "removed_local_files": 2,
        "built_in_seed_preserved": True,
        "packaged_static_preserved": False,
        "fallback_source": "built_in",
    }
    assert repository.status_for(_sample())["map_source"] == "built_in"


def test_corrupt_checksum_is_rejected(tmp_path: Path):
    artifact = _artifact(seed=False, quality_score=106)
    artifact["geometry_checksum"] = "a" * 64
    _write_local(tmp_path, artifact)
    assert CircuitCalibrationRepository(tmp_path).status_for(_sample())["calibration"] is None


def _sample() -> dict:
    first = _points()[0]
    return {
        "game_id": "f1_2021",
        "packet_format": 2021,
        "game_track_id": 20,
        "track_id": "baku",
        "track_name": "Baku",
        "track_length_m": 5994,
        "lap_distance_m": 2100,
        "position_x": first["x"] - 500,
        "position_z": 300 - first["y"],
        "yaw": 1.2,
    }


def _points() -> list[dict]:
    return [
        {
            "progress": index / 80,
            "x": round(500 + math.cos(index / 80 * math.tau) * 300, 3),
            "y": round(300 + math.sin(index / 80 * math.tau) * 200, 3),
        }
        for index in range(80)
    ]


def _artifact(*, seed: bool, quality_score: float) -> dict:
    points = _points()
    artifact = {
        "schema_version": 1,
        "calibration_id": "seed-f1_2021-2021-20-5994"
        if seed
        else "calibration-f1_2021-2021-20-5994",
        "game_id": "f1_2021",
        "packet_format": 2021,
        "game_track_id": 20,
        "track_id": "baku",
        "track_name": "Baku",
        "track_length_m": 5994,
        "layout_fingerprint": "f1_2021:2021:20:5994",
        "positioning_mode": "world_calibrated",
        "geometry_kind": "telemetry_derived_centreline",
        "view_box": {"width": 1000.0, "height": 600.0},
        "world_to_svg": {"scale": 1.0, "offset_x": 500.0, "offset_y": 300.0, "invert_z": True},
        "points": points,
        "segments": [points],
        "is_closed": True,
        "start_finish": points[0],
        "geometry_checksum": _checksum(points),
        "quality": {
            "bin_count": 80,
            "covered_bins": 80,
            "coverage_ratio": 1.0,
            "sample_count": 800,
            "rejected_samples": 0,
            "source_session_count": 1,
            "maximum_gap_bins": 0,
            "closure_distance_svg": 20.0,
            "quality_score": quality_score,
        },
        "provenance": (
            {
                "source": "built_in_telemetry_seed",
                "description": "Synthetic normalized seed",
                "calibration_method": "telemetry_derived_distance_bins",
                "privacy": "normalized_non_personal",
            }
            if seed
            else {
                "source": "local_progressive_f1_2021_motion_packets",
                "description": "Synthetic local calibration",
                "capture_reference": None,
                "generated_at": "2026-08-11T00:00:00Z",
                "calibration_method": "bounded_distance_bin_weighted_median",
            }
        ),
    }
    if seed:
        artifact["seed_version"] = 1
    return artifact


def _checksum(points: list[dict]) -> str:
    return hashlib.sha256(
        json.dumps(points, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _write_local(root: Path, artifact: dict) -> None:
    directory = root / "local" / "circuit-calibrations"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "f1_2021-2021-20-5994.json").write_text(json.dumps(artifact), encoding="utf-8")


def _write_seed(root: Path, artifact: dict) -> None:
    directory = root / "circuit-seeds"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "f1_2021-2021-20-5994.seed.json").write_text(
        json.dumps(artifact), encoding="utf-8"
    )
