from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path

from lapsignal.circuit_calibrations import CircuitCalibrationRepository

REPOSITORY_DATA = Path(__file__).parents[3] / "data"
SUPPORTED_IDS = [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    26,
    27,
    28,
    29,
]
TELEMETRY_SEED_IDS = {2, 3, 4, 5, 15, 20, 27, 28}


def test_clean_data_directory_loads_all_24_f1_2021_maps(tmp_path: Path):
    _copy_pack(tmp_path, include_seeds=True)
    manifest = json.loads((tmp_path / "circuit-maps" / "manifest.json").read_text())
    assert not (tmp_path / "local" / "circuit-calibrations").exists()
    repository = CircuitCalibrationRepository(tmp_path)

    assert [entry["game_track_id"] for entry in manifest["entries"]] == SUPPORTED_IDS
    for entry in manifest["entries"]:
        result = repository.status_for(
            _sample(entry["game_track_id"], entry["expected_track_length_m"])
        )
        assert result["calibration"] is not None, entry["track_name"]
        assert result["state"] == "distance_projected", entry["track_name"]
        assert result["positioning_source"] == "lap_distance"
        assert result["refining"] is False
        expected_source = "built_in" if entry["game_track_id"] in TELEMETRY_SEED_IDS else "static"
        assert result["map_source"] == expected_source, entry["track_name"]
        if expected_source == "static":
            assert result["calibration"]["asset_type"] == "packaged_static_centreline"
            assert result["calibration"]["layout_version"] == entry["layout_version"]
        positions = [
            _point_at_progress(result["calibration"]["points"], value)
            for value in (0, 0.25, 0.5, 0.75)
        ]
        assert len({(round(point[0], 3), round(point[1], 3)) for point in positions}) == 4
        assert _point_at_progress(result["calibration"]["points"], -0.1) == _point_at_progress(
            result["calibration"]["points"], 0.9
        )
        assert _point_at_progress(result["calibration"]["points"], 1.25) == positions[1]

    listed = repository.list_calibrations()["items"]
    assert len(listed) == 24
    assert {item["track_id"] for item in listed} == set(SUPPORTED_IDS)


def test_packaged_static_map_is_visible_without_lap_distance(tmp_path: Path):
    _copy_pack(tmp_path)
    result = CircuitCalibrationRepository(tmp_path).status_for(
        {**_sample(0, 5303), "lap_distance_m": None}
    )
    assert result["state"] == "telemetry_derived"
    assert result["label"] == "Packaged map"
    assert result["map_source"] == "static"
    assert len(result["calibration"]["points"]) == 240
    assert result["positioning_source"] == "none"


def test_partial_calibration_never_replaces_complete_static_map(tmp_path: Path):
    _copy_pack(tmp_path)
    partial = _local_artifact(0, "melbourne", "Melbourne", 5303, quality_score=40)
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
    directory = tmp_path / "local" / "circuit-calibrations"
    directory.mkdir(parents=True)
    (directory / "f1_2021-2021-0-5303.progress.json").write_text(
        json.dumps(
            {
                "schema_version": 2,
                "layout_fingerprint": "f1_2021:2021:0:5303",
                "game_id": "f1_2021",
                "packet_format": 2021,
                "game_track_id": 0,
                "track_name": "Melbourne",
                "progress": 0.5,
                "partial_calibration": partial,
            }
        ),
        encoding="utf-8",
    )
    result = CircuitCalibrationRepository(tmp_path).status_for(_sample(0, 5303))
    assert result["map_source"] == "static"
    assert result["calibration"]["asset_type"] == "packaged_static_centreline"
    assert result["calibration"]["is_closed"] is True
    assert result["refining"] is True


def test_strictly_high_quality_complete_local_map_can_refine_static_geometry(tmp_path: Path):
    _copy_pack(tmp_path)
    _write_local(tmp_path, _local_artifact(1, "paul-ricard", "Paul Ricard", 5814, quality_score=96))
    result = CircuitCalibrationRepository(tmp_path).status_for(
        {**_sample(1, 5814), "position_x": 500.0, "position_z": 250.0, "yaw": 1.2}
    )
    assert result["map_source"] == "local"
    assert result["state"] == "world_calibrated"
    assert result["positioning_source"] == "local_world"


def test_low_quality_local_map_cannot_replace_static_geometry(tmp_path: Path):
    _copy_pack(tmp_path)
    _write_local(tmp_path, _local_artifact(1, "paul-ricard", "Paul Ricard", 5814, quality_score=94))
    result = CircuitCalibrationRepository(tmp_path).status_for(_sample(1, 5814))
    assert result["map_source"] == "static"
    assert result["calibration"]["asset_type"] == "packaged_static_centreline"


def test_wrong_length_and_excluded_layouts_are_truthfully_unavailable(tmp_path: Path):
    _copy_pack(tmp_path, include_seeds=True)
    repository = CircuitCalibrationRepository(tmp_path)
    wrong_length = repository.status_for(_sample(0, 5200))
    hockenheim = repository.status_for(_sample(8, 4574))
    sakhir_short = repository.status_for(_sample(21, 3664))
    assert wrong_length["state"] == "unavailable"
    assert hockenheim["state"] == "unavailable"
    assert sakhir_short["state"] == "unavailable"
    assert all(result["calibration"] is None for result in (wrong_length, hockenheim, sakhir_short))


def test_numeric_id_selects_geometry_without_using_display_name(tmp_path: Path):
    _copy_pack(tmp_path)
    result = CircuitCalibrationRepository(tmp_path).status_for(
        {**_sample(0, 5303), "track_name": "Definitely not Melbourne", "track_id": "wrong-name"}
    )
    assert result["map_source"] == "static"
    assert result["calibration"]["game_track_id"] == 0
    assert result["calibration"]["track_name"] == "Melbourne"


def test_reset_of_local_refinement_falls_back_to_packaged_static_map(tmp_path: Path):
    _copy_pack(tmp_path)
    artifact = _local_artifact(1, "paul-ricard", "Paul Ricard", 5814, quality_score=96)
    _write_local(tmp_path, artifact)
    progress = tmp_path / "local" / "circuit-calibrations" / "f1_2021-2021-1-5814.progress.json"
    progress.write_text(
        json.dumps({"layout_fingerprint": "f1_2021:2021:1:5814", "progress": 0.4}),
        encoding="utf-8",
    )
    repository = CircuitCalibrationRepository(tmp_path)
    reset = repository.reset_local("f1_2021:2021:1:5814")
    assert reset["fallback_source"] == "static"
    assert reset["packaged_static_preserved"] is True
    result = repository.status_for(_sample(1, 5814))
    assert result["map_source"] == "static"
    assert result["calibration"]["asset_type"] == "packaged_static_centreline"


def test_corrupt_packaged_geometry_is_rejected(tmp_path: Path):
    _copy_pack(tmp_path)
    path = tmp_path / "circuit-maps" / "maps" / "00-melbourne.json"
    payload = json.loads(path.read_text())
    payload["points"][0]["x"] += 1
    path.write_text(json.dumps(payload), encoding="utf-8")
    result = CircuitCalibrationRepository(tmp_path).status_for(_sample(0, 5303))
    assert result["state"] == "unavailable"
    assert result["calibration"] is None


def _copy_pack(root: Path, *, include_seeds: bool = False) -> None:
    shutil.copytree(REPOSITORY_DATA / "circuit-maps", root / "circuit-maps")
    if include_seeds:
        shutil.copytree(REPOSITORY_DATA / "circuit-seeds", root / "circuit-seeds")


def _sample(track_id: int, track_length_m: int) -> dict:
    return {
        "game_id": "f1_2021",
        "packet_format": 2021,
        "game_track_id": track_id,
        "track_length_m": track_length_m,
        "lap_distance_m": track_length_m * 0.35,
        "position_x": None,
        "position_z": None,
        "yaw": None,
    }


def _local_artifact(
    track_id: int,
    track_slug: str,
    track_name: str,
    track_length_m: int,
    *,
    quality_score: float,
) -> dict:
    points = [
        {
            "progress": index / 80,
            "x": round(500 + math.cos(index / 80 * math.tau) * 300, 3),
            "y": round(300 + math.sin(index / 80 * math.tau) * 200, 3),
        }
        for index in range(80)
    ]
    fingerprint = f"f1_2021:2021:{track_id}:{track_length_m}"
    return {
        "schema_version": 1,
        "calibration_id": f"local-{track_id}",
        "game_id": "f1_2021",
        "packet_format": 2021,
        "game_track_id": track_id,
        "track_id": track_slug,
        "track_name": track_name,
        "track_length_m": track_length_m,
        "layout_fingerprint": fingerprint,
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
            "sample_count": 1200,
            "rejected_samples": 0,
            "source_session_count": 1,
            "maximum_gap_bins": 0,
            "closure_distance_svg": 20.0,
            "quality_score": quality_score,
        },
        "provenance": {
            "source": "local_progressive_f1_2021_motion_packets",
            "description": "Synthetic local calibration",
            "capture_reference": None,
            "generated_at": "2026-08-11T00:00:00Z",
            "calibration_method": "bounded_distance_bin_weighted_median",
        },
    }


def _write_local(root: Path, artifact: dict) -> None:
    directory = root / "local" / "circuit-calibrations"
    directory.mkdir(parents=True, exist_ok=True)
    stem = artifact["layout_fingerprint"].replace(":", "-")
    (directory / f"{stem}.json").write_text(json.dumps(artifact), encoding="utf-8")


def _checksum(points: list[dict]) -> str:
    return hashlib.sha256(
        json.dumps(points, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def _point_at_progress(points: list[dict], progress: float) -> tuple[float, float]:
    wrapped = ((progress % 1) + 1) % 1
    segments = []
    total = 0.0
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        length = math.hypot(next_point["x"] - point["x"], next_point["y"] - point["y"])
        segments.append((point, next_point, length))
        total += length
    remaining = wrapped * total
    for point, next_point, length in segments:
        if remaining <= length:
            ratio = remaining / length if length else 0
            return (
                point["x"] + (next_point["x"] - point["x"]) * ratio,
                point["y"] + (next_point["y"] - point["y"]) * ratio,
            )
        remaining -= length
    return points[0]["x"], points[0]["y"]
