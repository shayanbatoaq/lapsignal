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
    adapter_version: str
    session_uid: str
    frame_id: int = Field(ge=0)
    player_index: int = Field(ge=0, le=21)
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
    packet_id: int = Field(ge=0, le=255)

    @field_validator("tyre_wear", "tyre_temperatures", "surface_type")
    @classmethod
    def validate_wheel_array(cls, value: list | None) -> list | None:
        if value is not None and len(value) != 4:
            raise ValueError("wheel arrays must contain RL, RR, FL, FR values")
        return value


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
