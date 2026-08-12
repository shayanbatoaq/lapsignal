from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

import lapsignal.ai as ai_module
import lapsignal.main as main_module
from lapsignal.config import get_settings
from lapsignal.database import SessionLocal
from lapsignal.database_init import initialize_database
from lapsignal.main import LIVE_STATUS, _public_live_status, app
from lapsignal.models import (
    AIRun,
    AnalysisRun,
    CoachReport,
    DerivedMetric,
    Finding,
    Lap,
    RaceSession,
    Stint,
    TelemetryArtifact,
)
from tests.fixtures.synthetic_sessions import get_synthetic_sessions


@pytest.fixture(autouse=True)
def cleanup_live_test_artifacts():
    yield
    with SessionLocal() as db:
        ids = list(
            db.scalars(select(RaceSession.id).where(RaceSession.session_uid.like("test-%"))).all()
        )
        if ids:
            for model in (
                AIRun,
                CoachReport,
                Finding,
                DerivedMetric,
                AnalysisRun,
                Lap,
                Stint,
                TelemetryArtifact,
            ):
                db.execute(delete(model).where(model.session_id.in_(ids)))
            db.execute(delete(RaceSession).where(RaceSession.id.in_(ids)))
            db.commit()
    for directory in (
        get_settings().data_dir / "local" / "live" / "sessions",
        get_settings().data_dir / "local" / "sessions",
    ):
        if directory.exists():
            for path in directory.glob("*test-*"):
                path.unlink(missing_ok=True)


def create_recorded_session(client: TestClient, *, uid: str | None = None) -> str:
    uid = uid or f"test-recorded-{uuid4()}"
    source_laps = get_synthetic_sessions()[0]["laps"][:3]
    samples = []
    frame_id = 0
    for index, source_lap in enumerate(source_laps):
        for row in deepcopy(source_lap["telemetry"])[::3]:
            row.update(
                session_uid=uid,
                frame_id=frame_id,
                lap_number=index + 1,
                last_lap_time_ms=(source_laps[index - 1]["lap_time_ms"] if index else None),
            )
            frame_id += 1
            samples.append(row)
    response = client.post(
        "/v1/ingest/batches", json={"collector_id": "test-recorder", "samples": samples}
    )
    assert response.status_code == 200
    finalized = client.post(
        "/v1/collector/session-events",
        json={
            "collector_id": "test-recorder",
            "session_uid": uid,
            "event": "session_ended",
            "interrupted": False,
            "raw_capture_path": None,
            "normalized_capture_path": None,
        },
    )
    assert finalized.status_code == 200
    return finalized.json()["session_id"]


def test_health_and_version():
    with TestClient(app) as client:
        health = client.get("/health").json()
        assert health["status"] == "ok"
        assert health["application_version"] == "0.1.0-alpha.4"
        assert health["build_number"] == 4
        assert health["process_id"] > 0
        assert health["cloud_ai_guard_active"] is True
        assert health["ai_contract_schema_hash"] == (
            "1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715"
        )
        assert health["diagnostics_contract_version"] == "3"
        version = client.get("/v1/version").json()
        assert version["product"] == "0.1.0-alpha.4"
        assert version["build"] == 4
        assert version["build_identity"]["component"] == "api"


def test_database_initialization_is_idempotent_and_never_creates_sessions():
    with SessionLocal() as db:
        before = list(db.scalars(select(RaceSession.id)).all())

    first = initialize_database()
    second = initialize_database()

    with SessionLocal() as db:
        after = list(db.scalars(select(RaceSession.id)).all())
    assert first["sessions_created"] == 0
    assert second["sessions_created"] == 0
    assert after == before


def test_openapi_has_no_bundled_session_routes_or_provenance_fields():
    forbidden = "de" + "mo"
    with TestClient(app) as client:
        document = client.get("/openapi.json")
    assert document.status_code == 200
    assert forbidden not in document.text.lower()


def test_ai_status_never_validates_provider_while_cloud_gate_is_disabled(monkeypatch):
    calls = {"health": 0}

    class GuardProvider:
        name = "openrouter"

        def provider_metadata(self):
            return {
                "provider": "openrouter",
                "configured": True,
                "coach_model": "openai/gpt-5-mini",
            }

        async def health_check(self):
            calls["health"] += 1
            raise AssertionError("Provider metadata network access must stay disabled")

    monkeypatch.setattr(ai_module, "get_provider", lambda _name=None: GuardProvider())
    monkeypatch.setattr(
        main_module,
        "_profile_dict",
        lambda _db: {"ai_consent": True, "cloud_ai_enabled": False},
    )
    with TestClient(app) as client:
        payload = client.get("/v1/ai/status", params={"validate_model": True}).json()
    assert payload["model_validation_skipped"] == "cloud_ai_disabled"
    assert calls["health"] == 0


def test_session_list_filters_and_paginates():
    with TestClient(app) as client:
        create_recorded_session(client)
        response = client.get("/v1/sessions", params={"input_device": "controller", "page_size": 1})
        payload = response.json()
        assert response.status_code == 200
        assert payload["total"] == 1
        assert len(payload["items"]) == 1


def test_session_detail_and_downsampled_telemetry():
    with TestClient(app) as client:
        session_id = create_recorded_session(client)
        detail = client.get(f"/v1/sessions/{session_id}").json()
        assert detail["findings"]
        telemetry = client.get(
            f"/v1/sessions/{session_id}/telemetry",
            params={"lap_numbers": "1,2", "max_points": 60},
        ).json()
        assert len(telemetry["traces"]) == 2
        assert len(telemetry["traces"][0]["samples"]) <= 60


def test_ingestion_validation_and_live_snapshot():
    sample = deepcopy(get_synthetic_sessions()[0]["laps"][0]["telemetry"][0])
    sample["session_uid"] = f"test-ingestion-{uuid4()}"
    with TestClient(app) as client:
        response = client.post(
            "/v1/ingest/batches", json={"collector_id": "test", "samples": [sample]}
        )
        assert response.status_code == 200
        assert response.json()["accepted"] == 1
        status = client.get("/v1/collector/status").json()
        assert status["collector_id"] == "test"
        assert status["circuit_map"]["state"] == "distance_projected"
        assert status["circuit_map"]["map_source"] in {"built_in", "static"}


def test_circuit_calibration_management_routes_are_safe():
    with TestClient(app) as client:
        response = client.get("/v1/circuit-calibrations")
        assert response.status_code == 200
        items = response.json()["items"]
        assert items
        assert any(item["built_in_seed_available"] for item in items)
        assert all("session_uid" not in item for item in items)

        missing_confirmation = client.delete("/v1/circuit-calibrations/local/f1_2021:2021:20:5994")
        assert missing_confirmation.status_code == 400

        invalid_fingerprint = client.delete(
            "/v1/circuit-calibrations/local/not-a-layout",
            params={"confirm": "RESET LOCAL REFINEMENT"},
        )
        assert invalid_fingerprint.status_code == 400


def test_collector_heartbeat_exposes_safe_build_identity():
    build_identity = {
        "component": "collector",
        "application_version": "0.1.0-alpha.4",
        "build_number": 4,
        "git_commit": "test-commit",
        "process_id": 4242,
        "process_start_time": "2026-08-11T00:00:00Z",
    }
    with TestClient(app) as client:
        response = client.post(
            "/v1/collector/heartbeat",
            json={
                "collector_id": "collector-test",
                "collector_version": "0.1.0-alpha.4",
                "adapter_version": "0.1.0",
                "telemetry_schema_version": 1,
                "mode": "live",
                "session_uid": None,
                "packet_rate_hz": 0,
                "packet_loss_available": False,
                "out_of_order_frames": 0,
                "last_packet_at": None,
                "build_identity": build_identity,
            },
        )
        assert response.status_code == 200
        assert client.get("/v1/collector/status").json()["collector_build_identity"] == (
            build_identity
        )


def test_invalid_ingest_uses_error_envelope():
    with TestClient(app) as client:
        response = client.post("/v1/ingest/batches", json={"collector_id": "test", "samples": []})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


def test_rule_based_coach_and_report():
    with TestClient(app) as client:
        session_id = create_recorded_session(client)
        report = client.post(f"/v1/sessions/{session_id}/coach").json()
        assert report["label"] == "Rule-based coaching"
        assert len(report["priority_actions"]) <= 3
        public = client.get(f"/v1/reports/report-{session_id}").json()
        assert "telemetry" not in str(public)


def test_progress_and_websocket_snapshot():
    with TestClient(app) as client:
        create_recorded_session(client)
        assert client.get("/v1/progress").json()["points"]
        with client.websocket_connect("/v1/live") as socket:
            snapshot = socket.receive_json()
            assert snapshot["type"] == "snapshot"
            assert "circuit_map" in snapshot["status"]


def test_live_replay_offline_state_precedence():
    original = deepcopy(LIVE_STATUS)
    try:
        LIVE_STATUS.update(mode="live", last_packet_at=datetime.now(UTC).isoformat())
        assert _public_live_status()["state"] == "LIVE"
        LIVE_STATUS["mode"] = "replay"
        assert _public_live_status()["state"] == "REPLAY"
        LIVE_STATUS["last_packet_at"] = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        assert _public_live_status()["state"] == "OFFLINE"
    finally:
        LIVE_STATUS.clear()
        LIVE_STATUS.update(original)


def test_live_session_finalization_is_idempotent_and_performance_persists():
    base = get_synthetic_sessions()[0]["laps"]
    first = deepcopy(base[0]["telemetry"][0])
    second = deepcopy(base[1]["telemetry"][0])
    uid = f"test-live-finalization-{uuid4()}"
    first.update(
        session_uid=uid,
        lap_number=1,
        track_id="spa-francorchamps",
        track_name="Spa-Francorchamps",
        car_id="williams",
        team_id=3,
        team_name="Williams",
        formula="F1 Modern",
        session_type="Time Trial",
        track_length_m=1000,
    )
    second.update(
        session_uid=uid,
        lap_number=2,
        last_lap_time_ms=91234,
        track_id="spa-francorchamps",
        track_name="Spa-Francorchamps",
        car_id="williams",
        team_id=3,
        team_name="Williams",
        formula="F1 Modern",
        session_type="Time Trial",
        track_length_m=1000,
    )
    with TestClient(app) as client:
        assert (
            client.post(
                "/v1/ingest/batches",
                json={"collector_id": "physical-test", "samples": [first, second]},
            ).status_code
            == 200
        )
        finalized = client.post(
            "/v1/collector/session-events",
            json={
                "collector_id": "physical-test",
                "session_uid": uid,
                "event": "session_ended",
                "interrupted": False,
                "raw_capture_path": None,
                "normalized_capture_path": None,
            },
        ).json()
        repeated = client.post(
            "/v1/collector/session-events",
            json={
                "collector_id": "physical-test",
                "session_uid": uid,
                "event": "session_ended",
                "interrupted": False,
                "raw_capture_path": None,
                "normalized_capture_path": None,
            },
        ).json()
        assert finalized["completed_laps"] == 1 and repeated["idempotent"] is True
        session_id = finalized["session_id"]
        assert (
            client.put(
                f"/v1/sessions/{session_id}/performance-mode",
                json={"performance_mode": "realistic", "performance_mode_source": "user"},
            ).status_code
            == 200
        )
        detail = client.get(f"/v1/sessions/{session_id}").json()
        assert (
            detail["track_name"] == "Spa-Francorchamps"
            and detail["context"]["team_name"] == "Williams"
        )
        assert (
            detail["performance_mode"] == "realistic"
            and detail["performance_mode_source"] == "user"
        )
        assert detail["track_length_m"] == first["track_length_m"]
        assert detail["provenance"]["source"] == "physical_udp"
        assert "raw_capture" not in detail["provenance"]
        assert "normalized_capture" not in detail["provenance"]
        assert set(detail["metrics"]) == {
            "pace",
            "stint",
            "braking",
            "throttle",
            "steering",
        }
        telemetry = client.get(
            f"/v1/sessions/{session_id}/telemetry",
            params={"lap_numbers": "1", "channels": "speed_kph,brake_0_1"},
        )
        assert telemetry.status_code == 200
        assert telemetry.json()["traces"][0]["samples"]
