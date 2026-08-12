from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

from .schemas import (
    CircuitCalibrationArtifact,
    CircuitMapPackManifest,
    CircuitSeedArtifact,
    CircuitStaticMapArtifact,
)

STATIC_REFINEMENT_MINIMUM_SCORE = 95.0


def layout_fingerprint(sample: dict) -> str | None:
    game_id = sample.get("game_id")
    packet_format = sample.get("packet_format")
    game_track_id = sample.get("game_track_id")
    track_length = sample.get("track_length_m")
    if (
        not isinstance(game_id, str)
        or not game_id
        or not isinstance(packet_format, int)
        or not isinstance(game_track_id, int)
        or not _finite_positive(track_length)
    ):
        return None
    return f"{game_id}:{packet_format}:{game_track_id}:{round(float(track_length))}"


def calibration_file_stem_from_fingerprint(fingerprint: str) -> str:
    return "".join(
        character if character.isalnum() or character in "_-" else "-" for character in fingerprint
    )


def calibration_file_stem(sample: dict) -> str | None:
    fingerprint = layout_fingerprint(sample)
    return calibration_file_stem_from_fingerprint(fingerprint) if fingerprint else None


class CircuitCalibrationRepository:
    def __init__(self, data_dir: Path, *, asset_data_dir: Path | None = None):
        asset_root = (asset_data_dir or data_dir).resolve()
        self.directory = (data_dir / "local" / "circuit-calibrations").resolve()
        self.seed_directory = (asset_root / "circuit-seeds").resolve()
        self.pack_directory = (asset_root / "circuit-maps").resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self._cache: dict[Path, tuple[int, CircuitCalibrationArtifact | None]] = {}
        self._static_cache: dict[Path, tuple[int, CircuitStaticMapArtifact | None]] = {}
        self._manifest = self._read_manifest()

    def status_for(self, sample: dict | None) -> dict:
        if not sample:
            return _unavailable()
        fingerprint = layout_fingerprint(sample)
        stem = calibration_file_stem(sample)
        if fingerprint is None or stem is None:
            return _unavailable()

        local = self._read_artifact(self.directory / f"{stem}.json", seed=False)
        seed = self._read_artifact(self.seed_directory / f"{stem}.seed.json", seed=True)
        if local is not None and not self._matches(local, sample, fingerprint):
            local = None
        if seed is not None and not self._matches(seed, sample, fingerprint):
            seed = None
        progress = self._read_progress(self.directory / f"{stem}.progress.json", fingerprint)
        static = self._static_for(sample)
        selected, source = self._select(local, seed, static)

        if selected is not None:
            payload = selected.model_dump(mode="json", exclude_none=True)
            refining = progress is not None and float(progress.get("progress", 0)) > 0
            if _world_position_matches(sample, selected):
                return {
                    "state": "world_calibrated",
                    "label": "World calibrated",
                    "message": "The player marker uses an exact local world transform on the complete telemetry-derived centreline.",
                    "progress": 1.0,
                    "layout_fingerprint": fingerprint,
                    "calibration": payload,
                    "map_source": source,
                    "positioning_source": "seed_world" if source == "built_in" else "local_world",
                    "refining": refining,
                }
            if _finite(sample.get("lap_distance_m")) and _finite_positive(
                sample.get("track_length_m")
            ):
                return {
                    "state": "distance_projected",
                    "label": "Distance projected",
                    "message": "The complete circuit is ready and the player marker is positioned from normalized lap distance.",
                    "progress": 1.0,
                    "layout_fingerprint": fingerprint,
                    "calibration": payload,
                    "map_source": source,
                    "positioning_source": "lap_distance",
                    "refining": refining,
                }
            return {
                "state": "telemetry_derived",
                "label": "Built-in map" if source == "built_in" else "Local map",
                "message": "The complete telemetry-derived centreline is ready; the marker waits for position telemetry.",
                "progress": 1.0,
                "layout_fingerprint": fingerprint,
                "calibration": payload,
                "map_source": source,
                "positioning_source": "none",
                "refining": refining,
            }

        if static is not None:
            payload = static.model_dump(mode="json", exclude_none=True)
            refining = progress is not None or local is not None
            if _finite(sample.get("lap_distance_m")) and _finite_positive(
                sample.get("track_length_m")
            ):
                return {
                    "state": "distance_projected",
                    "label": "Distance projected",
                    "message": "The complete packaged circuit is visible immediately and the player marker is projected from lap distance.",
                    "progress": 1.0,
                    "layout_fingerprint": fingerprint,
                    "calibration": payload,
                    "map_source": "static",
                    "positioning_source": "lap_distance",
                    "refining": refining,
                }
            return {
                "state": "telemetry_derived",
                "label": "Packaged map",
                "message": "The complete packaged circuit is visible. A player marker appears when lap-distance telemetry is available.",
                "progress": 1.0,
                "layout_fingerprint": fingerprint,
                "calibration": payload,
                "map_source": "static",
                "positioning_source": "none",
                "refining": refining,
            }

        return _unavailable(fingerprint)

    def list_calibrations(self) -> dict:
        fingerprints: set[str] = set()
        if self._manifest:
            fingerprints.update(
                f"f1_2021:2021:{entry.game_track_id}:{round(entry.expected_track_length_m)}"
                for entry in self._manifest.entries
            )
        for path in self.directory.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload.get("layout_fingerprint"), str):
                    fingerprints.add(payload["layout_fingerprint"])
            except (OSError, json.JSONDecodeError):
                continue
        for path in self.seed_directory.glob("*.seed.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload.get("layout_fingerprint"), str):
                    fingerprints.add(payload["layout_fingerprint"])
            except (OSError, json.JSONDecodeError):
                continue

        items = []
        for fingerprint in sorted(fingerprints):
            stem = calibration_file_stem_from_fingerprint(fingerprint)
            local_path = self.directory / f"{stem}.json"
            seed_path = self.seed_directory / f"{stem}.seed.json"
            progress_path = self.directory / f"{stem}.progress.json"
            local = self._read_artifact(local_path, seed=False)
            seed = self._read_artifact(seed_path, seed=True)
            progress = self._read_progress(progress_path, fingerprint)
            manifest_entry = self._manifest_entry_for_fingerprint(fingerprint)
            static = self._static_for_entry(manifest_entry) if manifest_entry else None
            selected, source = self._select(local, seed, static)
            if selected is None and static is not None:
                source = "static"
            identity = selected or local or seed or static
            if identity is None and progress:
                identity = _artifact_from_payload(progress.get("partial_calibration"))
            track_name = (
                identity.track_name
                if identity
                else manifest_entry.track_name
                if manifest_entry
                else str((progress or {}).get("track_name", "Unknown circuit"))
            )
            track_id = (
                identity.game_track_id
                if identity
                else int((progress or {}).get("game_track_id", -1))
            )
            packet_format = (
                identity.packet_format
                if identity
                else int((progress or {}).get("packet_format", 0))
            )
            game_id = (
                identity.game_id if identity else str((progress or {}).get("game_id", "unknown"))
            )
            coverage = (
                selected.quality.coverage_ratio
                if selected
                else 1.0
                if static
                else float((progress or {}).get("progress", 0))
            )
            updated_path = (
                progress_path
                if progress_path.is_file()
                else local_path
                if local_path.is_file()
                else self.pack_directory / "manifest.json"
            )
            items.append(
                {
                    "layout_fingerprint": fingerprint,
                    "circuit_name": track_name,
                    "game_id": game_id,
                    "packet_format": packet_format,
                    "track_id": track_id,
                    "built_in_seed_available": seed is not None,
                    "packaged_static_available": static is not None,
                    "local_calibration_available": local is not None or progress is not None,
                    "coverage": round(coverage, 6),
                    "quality_status": "verified" if selected or static else "unavailable",
                    "positioning_capability": "world_and_distance"
                    if selected
                    else "distance_and_static"
                    if static
                    else "unavailable",
                    "checksum": selected.geometry_checksum
                    if selected
                    else static.geometry_checksum
                    if static
                    else None,
                    "selected_source": source if selected or static else "none",
                    "last_updated": datetime.fromtimestamp(
                        updated_path.stat().st_mtime, tz=UTC
                    ).isoformat()
                    if updated_path.is_file()
                    else None,
                }
            )
        return {"items": items}

    def reset_local(self, fingerprint: str) -> dict:
        if not _valid_fingerprint(fingerprint):
            raise ValueError("Invalid layout fingerprint")
        stem = calibration_file_stem_from_fingerprint(fingerprint)
        removed: list[str] = []
        for suffix in (".json", ".progress.json"):
            path = (self.directory / f"{stem}{suffix}").resolve()
            if path.parent != self.directory:
                raise ValueError("Invalid calibration path")
            if path.is_file():
                path.unlink()
                removed.append(suffix)
            self._cache.pop(path, None)
        seed = self._read_artifact(self.seed_directory / f"{stem}.seed.json", seed=True)
        manifest_entry = self._manifest_entry_for_fingerprint(fingerprint)
        static = self._static_for_entry(manifest_entry) if manifest_entry else None
        return {
            "layout_fingerprint": fingerprint,
            "removed_local_files": len(removed),
            "built_in_seed_preserved": seed is not None,
            "packaged_static_preserved": static is not None,
            "fallback_source": "built_in" if seed else "static" if static else "unavailable",
        }

    def _read_manifest(self) -> CircuitMapPackManifest | None:
        path = self.pack_directory / "manifest.json"
        if not path.is_file() or path.parent != self.pack_directory:
            return None
        try:
            manifest = CircuitMapPackManifest.model_validate_json(path.read_text(encoding="utf-8"))
            expected = [
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
            ids = [entry.game_track_id for entry in manifest.entries]
            if ids != expected or manifest.supported_track_ids != expected:
                return None
            return manifest
        except (OSError, ValidationError, json.JSONDecodeError):
            return None

    def _manifest_entry_for_fingerprint(self, fingerprint: str):
        if not self._manifest:
            return None
        parts = fingerprint.split(":")
        if len(parts) != 4 or not parts[2].isdigit() or not parts[3].isdigit():
            return None
        track_id, track_length = int(parts[2]), int(parts[3])
        return next(
            (
                entry
                for entry in self._manifest.entries
                if entry.game_track_id == track_id
                and abs(entry.expected_track_length_m - track_length)
                <= entry.track_length_tolerance_m
            ),
            None,
        )

    def _static_for(self, sample: dict) -> CircuitStaticMapArtifact | None:
        if sample.get("game_id") != "f1_2021" or sample.get("packet_format") != 2021:
            return None
        fingerprint = layout_fingerprint(sample)
        entry = self._manifest_entry_for_fingerprint(fingerprint) if fingerprint else None
        return self._static_for_entry(entry) if entry else None

    def _static_for_entry(self, entry) -> CircuitStaticMapArtifact | None:
        if entry is None or entry.representation != "packaged_static":
            return None
        path = (self.pack_directory / entry.asset_path).resolve()
        try:
            path.relative_to(self.pack_directory)
        except ValueError:
            return None
        if not path.is_file():
            return None
        modified = path.stat().st_mtime_ns
        cached = self._static_cache.get(path)
        if cached and cached[0] == modified:
            return cached[1]
        artifact: CircuitStaticMapArtifact | None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            artifact = CircuitStaticMapArtifact.model_validate(payload)
            if (
                not _checksum_matches(payload)
                or artifact.game_track_id != entry.game_track_id
                or artifact.geometry_checksum != entry.geometry_checksum
                or artifact.expected_track_length_m != entry.expected_track_length_m
            ):
                artifact = None
        except (OSError, ValidationError, json.JSONDecodeError):
            artifact = None
        self._static_cache[path] = (modified, artifact)
        return artifact

    def _read_artifact(self, path: Path, *, seed: bool) -> CircuitCalibrationArtifact | None:
        expected_parent = self.seed_directory if seed else self.directory
        if not path.is_file() or path.parent != expected_parent:
            return None
        modified = path.stat().st_mtime_ns
        cached = self._cache.get(path)
        if cached and cached[0] == modified:
            return cached[1]
        artifact: CircuitCalibrationArtifact | None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            artifact = (
                CircuitSeedArtifact.model_validate(payload)
                if seed
                else CircuitCalibrationArtifact.model_validate(payload)
            )
            if not _checksum_matches(payload):
                artifact = None
        except (OSError, ValidationError, json.JSONDecodeError):
            artifact = None
        self._cache[path] = (modified, artifact)
        return artifact

    @staticmethod
    def _read_progress(path: Path, expected_fingerprint: str) -> dict | None:
        if not path.is_file():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("layout_fingerprint") != expected_fingerprint:
                return None
            progress = float(payload.get("progress", 0))
            if not math.isfinite(progress):
                return None
            partial_payload = payload.get("partial_calibration")
            partial = _artifact_from_payload(partial_payload)
            if partial_payload is not None and partial is None:
                partial_payload = None
            return {
                **payload,
                "progress": max(0.0, min(1.0, progress)),
                "partial_calibration": partial.model_dump(mode="json", exclude_none=True)
                if partial
                else None,
            }
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return None

    @staticmethod
    def _matches(artifact: CircuitCalibrationArtifact, sample: dict, fingerprint: str) -> bool:
        return (
            artifact.layout_fingerprint == fingerprint
            and artifact.game_id == sample.get("game_id")
            and artifact.packet_format == sample.get("packet_format")
            and artifact.game_track_id == sample.get("game_track_id")
            and round(artifact.track_length_m) == round(float(sample.get("track_length_m")))
        )

    @staticmethod
    def _select(
        local: CircuitCalibrationArtifact | None,
        seed: CircuitCalibrationArtifact | None,
        static: CircuitStaticMapArtifact | None,
    ) -> tuple[CircuitCalibrationArtifact | None, str]:
        if seed:
            return seed, "built_in"
        if local and static and _quality_score(local) >= STATIC_REFINEMENT_MINIMUM_SCORE:
            return local, "local"
        return None, "none"


def _quality_score(artifact: CircuitCalibrationArtifact) -> float:
    quality = artifact.quality
    if quality.quality_score is not None:
        return quality.quality_score
    samples = max(1, quality.sample_count)
    rejected = max(0, quality.rejected_samples)
    maximum_gap = quality.maximum_gap_bins
    if maximum_gap is None:
        maximum_gap = max(0, quality.bin_count - quality.covered_bins)
    closure = quality.closure_distance_svg
    if closure is None and len(artifact.points) >= 2:
        first, last = artifact.points[0], artifact.points[-1]
        closure = math.hypot(first.x - last.x, first.y - last.y)
    score = (
        quality.coverage_ratio * 100
        + min(samples, 5000) / 500
        + min(max(1, quality.source_session_count or 1), 10) * 0.5
        - rejected / (samples + rejected) * 10
        - max(0, maximum_gap) * 0.05
        - max(0, closure or 0) * 0.001
    )
    return round(max(0, score), 6)


def _artifact_from_payload(payload: object) -> CircuitCalibrationArtifact | None:
    if not isinstance(payload, dict):
        return None
    try:
        artifact = CircuitCalibrationArtifact.model_validate(payload)
        return artifact if _checksum_matches(payload) else None
    except ValidationError:
        return None


def _checksum_matches(payload: dict) -> bool:
    points = payload.get("points")
    checksum = payload.get("geometry_checksum")
    if not isinstance(points, list) or not isinstance(checksum, str):
        return False
    encoded = json.dumps(points, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest() == checksum


def _world_position_matches(sample: dict, artifact: CircuitCalibrationArtifact) -> bool:
    if not (
        _finite(sample.get("position_x"))
        and _finite(sample.get("position_z"))
        and _finite(sample.get("yaw"))
    ):
        return False
    transform = artifact.world_to_svg
    x = float(sample["position_x"]) * transform.scale + transform.offset_x
    y = transform.offset_y - float(sample["position_z"]) * transform.scale
    margin_x = artifact.view_box["width"] * 0.2
    margin_y = artifact.view_box["height"] * 0.2
    return (
        -margin_x <= x <= artifact.view_box["width"] + margin_x
        and -margin_y <= y <= artifact.view_box["height"] + margin_y
    )


def _unavailable(fingerprint: str | None = None) -> dict:
    return {
        "state": "unavailable",
        "label": "Circuit map unavailable",
        "message": "Start driving to learn this circuit. A valid lap is not required.",
        "progress": 0.0,
        "layout_fingerprint": fingerprint,
        "calibration": None,
        "map_source": "none",
        "positioning_source": "none",
        "refining": False,
    }


def _valid_fingerprint(value: str) -> bool:
    parts = value.split(":")
    return (
        len(parts) == 4
        and parts[0] == "f1_2021"
        and all(part.isdigit() for part in parts[1:])
        and len(value) <= 100
    )


def _finite(value: object) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def _finite_positive(value: object) -> bool:
    return _finite(value) and float(value) > 0
