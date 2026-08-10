from __future__ import annotations

from fastapi.testclient import TestClient

from lapsignal.demo import get_demo_sessions
from lapsignal.main import app


def test_health_and_version():
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        version = client.get("/v1/version").json()
        assert version["product"] == "0.1.0-alpha.3"
        assert version["build"] == 3


def test_session_list_filters_and_paginates():
    with TestClient(app) as client:
        response = client.get("/v1/sessions", params={"input_device": "controller", "page_size": 1})
        payload = response.json()
        assert response.status_code == 200
        assert payload["total"] == 2
        assert len(payload["items"]) == 1


def test_session_detail_and_downsampled_telemetry():
    session_id = get_demo_sessions()[0]["id"]
    with TestClient(app) as client:
        detail = client.get(f"/v1/sessions/{session_id}").json()
        assert detail["findings"]
        telemetry = client.get(
            f"/v1/sessions/{session_id}/telemetry",
            params={"lap_numbers": "1,2", "max_points": 60},
        ).json()
        assert len(telemetry["traces"]) == 2
        assert len(telemetry["traces"][0]["samples"]) <= 60


def test_ingestion_validation_and_live_snapshot():
    sample = get_demo_sessions()[0]["laps"][0]["telemetry"][0]
    with TestClient(app) as client:
        response = client.post(
            "/v1/ingest/batches", json={"collector_id": "test", "samples": [sample]}
        )
        assert response.status_code == 200
        assert response.json()["accepted"] == 1
        assert client.get("/v1/collector/status").json()["collector_id"] == "test"


def test_invalid_ingest_uses_error_envelope():
    with TestClient(app) as client:
        response = client.post("/v1/ingest/batches", json={"collector_id": "test", "samples": []})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


def test_rule_based_coach_and_report():
    session = get_demo_sessions()[0]
    with TestClient(app) as client:
        report = client.post(f"/v1/sessions/{session['id']}/coach").json()
        assert report["label"] == "Rule-based coach"
        assert len(report["top_priorities"]) <= 3
        public = client.get(f"/v1/reports/{session['report']['id']}").json()
        assert "telemetry" not in str(public)


def test_progress_and_websocket_snapshot():
    with TestClient(app) as client:
        assert client.get("/v1/progress").json()["points"]
        with client.websocket_connect("/v1/live") as socket:
            assert socket.receive_json()["type"] == "snapshot"
