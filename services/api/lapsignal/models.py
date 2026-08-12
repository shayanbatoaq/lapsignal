from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DriverProfile(TimestampMixin, Base):
    __tablename__ = "driver_profiles"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str] = mapped_column(String, default="Local Driver")
    experience_level: Mapped[str] = mapped_column(String, default="intermediate")
    input_device: Mapped[str] = mapped_column(String, default="controller")
    primary_interest: Mapped[str] = mapped_column(String, default="mixed")
    coaching_goal: Mapped[str] = mapped_column(String, default="consistency")
    units: Mapped[str] = mapped_column(String, default="metric")
    ai_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    cloud_ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    post_session_ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_live_lap_coaching: Mapped[bool] = mapped_column(Boolean, default=False)


class Device(TimestampMixin, Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("driver_profiles.id"))
    device_type: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)


class GameAdapter(TimestampMixin, Base):
    __tablename__ = "game_adapters"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    game_id: Mapped[str] = mapped_column(String, index=True)
    adapter_version: Mapped[str] = mapped_column(String)
    telemetry_schema_version: Mapped[int] = mapped_column(Integer)


class CollectorInstance(TimestampMixin, Base):
    __tablename__ = "collector_instances"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    version: Mapped[str] = mapped_column(String)
    mode: Mapped[str] = mapped_column(String)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status_json: Mapped[dict] = mapped_column(JSON, default=dict)


class RaceSession(TimestampMixin, Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("driver_profiles.id"))
    adapter_id: Mapped[str] = mapped_column(ForeignKey("game_adapters.id"))
    session_uid: Mapped[str] = mapped_column(String, unique=True, index=True)
    game_id: Mapped[str] = mapped_column(String, index=True)
    track_id: Mapped[str] = mapped_column(String, index=True)
    car_id: Mapped[str] = mapped_column(String)
    car_class: Mapped[str] = mapped_column(String, index=True)
    session_type: Mapped[str] = mapped_column(String, index=True)
    input_device: Mapped[str] = mapped_column(String, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="analyzed")
    best_lap_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consistency_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    context_json: Mapped[dict] = mapped_column(JSON, default=dict)
    performance_mode: Mapped[str] = mapped_column(String, default="unknown")
    performance_mode_source: Mapped[str] = mapped_column(String, default="unknown")
    last_packet_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    interrupted: Mapped[bool] = mapped_column(Boolean, default=False)
    stints: Mapped[list[Stint]] = relationship(back_populates="session", cascade="all, delete")
    laps: Mapped[list[Lap]] = relationship(back_populates="session", cascade="all, delete")


class Stint(TimestampMixin, Base):
    __tablename__ = "stints"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    start_lap: Mapped[int] = mapped_column(Integer)
    end_lap: Mapped[int] = mapped_column(Integer)
    compound: Mapped[str | None] = mapped_column(String, nullable=True)
    session: Mapped[RaceSession] = relationship(back_populates="stints")


class Lap(TimestampMixin, Base):
    __tablename__ = "laps"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    stint_id: Mapped[str | None] = mapped_column(ForeignKey("stints.id"), nullable=True)
    lap_number: Mapped[int] = mapped_column(Integer)
    lap_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sector_times_ms: Mapped[list[int]] = mapped_column(JSON, default=list)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    classification: Mapped[str] = mapped_column(String, default="clean")
    quality_score: Mapped[float] = mapped_column(Float, default=1.0)
    session: Mapped[RaceSession] = relationship(back_populates="laps")


class TelemetryArtifact(TimestampMixin, Base):
    __tablename__ = "telemetry_artifacts"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    kind: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    format: Mapped[str] = mapped_column(String)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    schema_version: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String, nullable=True)


class DerivedMetric(TimestampMixin, Base):
    __tablename__ = "derived_metrics"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    key: Mapped[str] = mapped_column(String, index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String)
    scope: Mapped[str] = mapped_column(String, default="session")
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class AnalysisRun(TimestampMixin, Base):
    __tablename__ = "analysis_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    version: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    limitations: Mapped[list[str]] = mapped_column(JSON, default=list)


class Finding(TimestampMixin, Base):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    finding_type: Mapped[str] = mapped_column(String)
    priority: Mapped[int] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String)
    confidence: Mapped[float] = mapped_column(Float)
    title: Mapped[str] = mapped_column(String)
    plain_language: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list[dict]] = mapped_column(JSON)
    limitations: Mapped[list[str]] = mapped_column(JSON, default=list)


class CoachReport(TimestampMixin, Base):
    __tablename__ = "coach_reports"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    analysis_run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id"))
    mode: Mapped[str] = mapped_column(String)
    report_json: Mapped[dict] = mapped_column(JSON)


class CoachMessage(TimestampMixin, Base):
    __tablename__ = "coach_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("coach_reports.id"), index=True)
    role: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    evidence_ids: Mapped[list[str]] = mapped_column(JSON, default=list)


class ModelRun(TimestampMixin, Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    report_id: Mapped[str | None] = mapped_column(ForeignKey("coach_reports.id"), nullable=True)
    model_id: Mapped[str] = mapped_column(String)
    prompt_version: Mapped[str] = mapped_column(String)
    tool_calls: Mapped[list[dict]] = mapped_column(JSON, default=list)
    finding_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    token_usage: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    response_status: Mapped[str] = mapped_column(String)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=True)
    git_sha: Mapped[str] = mapped_column(String)


class AIRun(TimestampMixin, Base):
    __tablename__ = "ai_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("sessions.id"), nullable=True, index=True
    )
    provider: Mapped[str] = mapped_column(String, index=True)
    requested_model: Mapped[str] = mapped_column(String)
    resolved_model: Mapped[str | None] = mapped_column(String, nullable=True)
    prompt_version: Mapped[str] = mapped_column(String)
    output_schema_version: Mapped[str] = mapped_column(String)
    evidence_hash: Mapped[str] = mapped_column(String, index=True)
    cache_key: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String)
    error_category: Mapped[str | None] = mapped_column(String, nullable=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_result: Mapped[str] = mapped_column(String, default="not_run")
    response_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class AppBuild(TimestampMixin, Base):
    __tablename__ = "app_builds"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    product_version: Mapped[str] = mapped_column(String)
    build_number: Mapped[int] = mapped_column(Integer)
    git_sha: Mapped[str] = mapped_column(String)
    versions_json: Mapped[dict] = mapped_column(JSON)
