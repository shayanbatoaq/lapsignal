from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict | list | None = None


class ErrorEnvelope(BaseModel):
    error: ErrorDetail
    request_id: str | None = None


class TelemetrySample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    timestamp_ms: int = Field(ge=0)
    received_at_ms: int = Field(ge=0)
    game_id: str
    game_version: str
    packet_format: int | None = Field(default=None, ge=1)
    adapter_version: str
    session_uid: str
    frame_id: int = Field(ge=0)
    player_index: int = Field(ge=0, le=21)
    game_track_id: int | None = Field(default=None, ge=-1, le=127)
    track_id: str | None = None
    car_id: str | None = None
    car_class: str | None = None
    session_type: str | None = None
    track_name: str | None = None
    track_length_m: float | None = None
    weather: str | None = None
    formula: str | None = None
    team_id: int | None = None
    team_name: str | None = None
    car_number: int | None = None
    assist_profile: dict[str, str] | None = None
    input_device: Literal["controller", "wheel", "unknown"] = "unknown"
    lap_number: int = Field(ge=0)
    lap_distance_m: float | None = None
    total_distance_m: float | None = None
    current_lap_time_ms: float | None = None
    last_lap_time_ms: float | None = None
    sector: int | None = Field(default=None, ge=0, le=3)
    position_x: float | None = None
    position_y: float | None = None
    position_z: float | None = None
    yaw: float | None = None
    pitch: float | None = None
    roll: float | None = None
    speed_kph: float | None = None
    throttle_0_1: float | None = Field(default=None, ge=0, le=1)
    brake_0_1: float | None = Field(default=None, ge=0, le=1)
    steer_minus1_1: float | None = Field(default=None, ge=-1, le=1)
    clutch_0_1: float | None = Field(default=None, ge=0, le=1)
    gear: int | None = Field(default=None, ge=-1, le=8)
    rpm: int | None = Field(default=None, ge=0)
    drs: bool | None = None
    fuel_kg: float | None = None
    tyre_wear: list[float | None] | None = None
    tyre_temperatures: list[float | None] | None = None
    surface_type: list[int] | None = None
    lap_invalid: bool = False
    pit_status: int | None = Field(default=None, ge=0, le=2)
    driver_status: int | None = Field(default=None, ge=0, le=4)
    packet_id: int = Field(ge=0, le=255)

    @field_validator("tyre_wear", "tyre_temperatures", "surface_type")
    @classmethod
    def validate_wheel_array(cls, value: list | None) -> list | None:
        if value is not None and len(value) != 4:
            raise ValueError("wheel arrays must contain RL, RR, FL, FR values")
        return value


class CircuitCalibrationPoint(BaseModel):
    progress: float = Field(ge=0, le=1)
    x: float
    y: float


class CircuitCalibrationTransform(BaseModel):
    scale: float = Field(gt=0)
    offset_x: float
    offset_y: float
    invert_z: Literal[True]


class CircuitCalibrationQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bin_count: int = Field(ge=80, le=1000)
    covered_bins: int = Field(ge=0)
    coverage_ratio: float = Field(ge=0, le=1)
    sample_count: int = Field(gt=0)
    rejected_samples: int = Field(ge=0)
    lap_number: int | None = Field(default=None, gt=0)
    source_session_count: int | None = Field(default=None, gt=0)
    maximum_gap_bins: int | None = Field(default=None, ge=0)
    closure_distance_svg: float | None = Field(default=None, ge=0)
    quality_score: float | None = Field(default=None, ge=0)


class CircuitCalibrationArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    calibration_id: str
    game_id: str
    packet_format: int = Field(gt=0)
    game_track_id: int = Field(ge=0, le=127)
    track_id: str
    track_name: str
    track_length_m: float = Field(gt=0)
    layout_fingerprint: str
    positioning_mode: Literal["world_calibrated", "distance_projected", "partial"]
    geometry_kind: Literal["telemetry_derived_centreline", "telemetry_derived_partial"]
    view_box: dict[str, float]
    world_to_svg: CircuitCalibrationTransform
    points: list[CircuitCalibrationPoint] = Field(min_length=2, max_length=1000)
    segments: list[list[CircuitCalibrationPoint]] | None = None
    is_closed: bool = True
    start_finish: CircuitCalibrationPoint
    geometry_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    quality: CircuitCalibrationQuality
    provenance: dict


class BuiltInCalibrationProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["built_in_telemetry_seed"]
    description: str
    calibration_method: Literal["telemetry_derived_distance_bins"]
    privacy: Literal["normalized_non_personal"]


class CircuitSeedArtifact(CircuitCalibrationArtifact):
    seed_version: Literal[1]
    positioning_mode: Literal["world_calibrated"]
    geometry_kind: Literal["telemetry_derived_centreline"]
    provenance: BuiltInCalibrationProvenance


class CircuitStaticMapSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["licensed_versioned_svg"]
    project: str
    author: str
    license: str
    attribution: str
    repository_url: str
    asset_url: str
    layout_metadata_url: str
    source_commit: str = Field(pattern=r"^[a-f0-9]{40}$")
    source_svg_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    validation_references: list[str] = Field(min_length=2)
    retrieved_at: str
    transform: str
    runtime_network_required: Literal[False]


class CircuitStaticMapArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    asset_type: Literal["packaged_static_centreline"]
    game_id: Literal["f1_2021"]
    packet_format: Literal[2021]
    game_track_id: int = Field(ge=0, le=127)
    track_id: str
    track_name: str
    expected_track_length_m: float = Field(gt=0)
    track_length_tolerance_m: float = Field(gt=0, le=100)
    layout_fingerprint: str
    layout_id: str
    layout_version: str
    direction: Literal["clockwise", "anticlockwise"]
    path_direction: Literal["racing_direction"]
    source_path_reversed: bool
    progress_origin: Literal["start_finish_at_source_path_origin"]
    start_finish_progress: Literal[0]
    display_rotation_deg: float
    validation_status: Literal["verified_against_secondary_reference"]
    positioning_mode: Literal["distance_projected"]
    geometry_kind: Literal["packaged_static_centreline"]
    view_box: dict[str, float]
    points: list[CircuitCalibrationPoint] = Field(min_length=80, max_length=1000)
    is_closed: Literal[True]
    start_finish: CircuitCalibrationPoint
    geometry_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    source: CircuitStaticMapSource


class CircuitMapPackEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_track_id: int = Field(ge=0, le=127)
    track_id: str
    track_name: str
    expected_track_length_m: float = Field(gt=0)
    track_length_tolerance_m: float = Field(gt=0, le=100)
    layout_fingerprint: str
    layout_version: str
    direction: Literal["clockwise", "anticlockwise"]
    path_direction: Literal["racing_direction"]
    start_finish_progress: Literal[0]
    display_rotation_deg: float
    validation_status: Literal["exact_game_telemetry_seed", "verified_against_secondary_reference"]
    representation: Literal["telemetry_seed", "packaged_static"]
    asset_path: str
    positioning_capabilities: list[str]
    geometry_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    source: dict


class CircuitMapPackManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    pack_id: Literal["lapsignal-f1-2021-full-circuits"]
    game_id: Literal["f1_2021"]
    packet_format: Literal[2021]
    expected_track_count: Literal[24]
    supported_track_ids: list[int] = Field(min_length=24, max_length=24)
    excluded: list[dict]
    entries: list[CircuitMapPackEntry] = Field(min_length=24, max_length=24)


class CollectorBuildIdentity(BaseModel):
    component: Literal["collector"]
    application_version: str
    build_number: int = Field(ge=1)
    git_commit: str
    process_id: int = Field(ge=1)
    process_start_time: datetime


class CollectorHeartbeat(BaseModel):
    collector_id: str
    collector_version: str
    adapter_version: str
    telemetry_schema_version: Literal[1]
    mode: Literal["live", "replay"]
    session_uid: str | None = None
    packet_rate_hz: float = Field(ge=0)
    packet_loss_available: Literal[False] = False
    out_of_order_frames: int = Field(ge=0)
    last_packet_at: datetime | None = None
    build_identity: CollectorBuildIdentity


class IngestBatch(BaseModel):
    collector_id: str
    samples: list[TelemetrySample] = Field(min_length=1, max_length=1000)


class DriverProfilePayload(BaseModel):
    experience_level: Literal["beginner", "intermediate", "advanced"]
    input_device: Literal["controller", "wheel", "unknown"]
    primary_interest: Literal["f1", "gt3", "endurance", "mixed"]
    coaching_goal: Literal["pace", "consistency", "racecraft", "tyre_management", "learning"]
    units: Literal["metric", "imperial"] = "metric"
    ai_consent: bool = False
    cloud_ai_enabled: bool = False
    post_session_ai_enabled: bool = False
    ai_live_lap_coaching: bool = False


class CollectorSessionEvent(BaseModel):
    collector_id: str
    session_uid: str
    event: Literal["session_ended", "session_changed", "collector_shutdown"]
    interrupted: bool = False
    raw_capture_path: str | None = None
    normalized_capture_path: str | None = None


class PerformanceModePayload(BaseModel):
    performance_mode: Literal["equal", "realistic", "unknown"]
    performance_mode_source: Literal["user", "imported", "default", "unknown"] = "user"


class CoachQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class PaginatedSessions(BaseModel):
    items: list[dict]
    page: int
    page_size: int
    total: int
    pages: int


class SessionLapResponse(BaseModel):
    id: str
    lap_number: int
    lap_time_ms: int | None
    sector_times_ms: list[int]
    valid: bool
    classification: str
    quality_score: float
    tyre_wear_pct: float | None = None
    coaching_available: bool | None = None
    status_label: str | None = None


class SessionMetricsResponse(BaseModel):
    pace: dict | None
    stint: dict | None
    braking: list[dict] | None
    throttle: dict | None
    steering: dict | None


class SessionDetailResponse(BaseModel):
    id: str
    title: str
    session_uid: str
    game_id: str
    game_label: str
    track_id: str
    track_name: str
    track_length_m: float | None
    car_id: str
    car_class: str
    session_type: str
    input_device: Literal["controller", "wheel", "unknown"]
    started_at: datetime
    completed_at: datetime | None
    analysis_status: str
    performance_mode: Literal["equal", "realistic", "unknown"] | None = None
    performance_mode_source: Literal["user", "imported", "default", "unknown"] | None = None
    context: dict | None = None
    interrupted: bool | None = None
    laps: list[SessionLapResponse]
    metrics: SessionMetricsResponse
    findings: list[dict]
    provenance: dict
    report: dict | None
    circuit_map: dict | None = None
    analysis_version: str | None = None
