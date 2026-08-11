import { describe, expect, it, vi } from "vitest";

import { getSessionDetail, getSessionSummaries, getTelemetry } from "@/lib/data";

function sessionResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "sanitized-session",
    title: "Test circuit · Practice",
    session_uid: "synthetic-session",
    game_id: "test_game",
    game_label: "Test game",
    track_id: "test-circuit",
    track_name: "Test circuit",
    track_length_m: 1000,
    car_id: "unknown",
    car_class: "Open wheel",
    session_type: "Practice",
    input_device: "unknown",
    started_at: "2000-01-01T00:00:00Z",
    completed_at: "2000-01-01T00:05:00Z",
    demo_data: false,
    analysis_status: "analyzed",
    performance_mode: "unknown",
    performance_mode_source: "unknown",
    context: {},
    interrupted: false,
    laps: [{
      id: "lap-one",
      lap_number: 1,
      lap_time_ms: 90000,
      sector_times_ms: [30000, 30000, 30000],
      valid: true,
      classification: "clean",
      quality_score: 1,
      tyre_wear_pct: null,
      coaching_available: true,
      status_label: "Clean lap"
    }],
    metrics: {
      pace: { clean_laps: 1, best_lap_ms: 90000, median_lap_ms: 90000, mean_lap_ms: 90000, std_dev_ms: 0, consistency_score: 100, theoretical_best_ms: 90000, pace_degradation_ms_per_lap: null, limitations: [] },
      stint: { pace_degradation_ms_per_lap: 0, phase_consistency: {}, tyre_wear_correlation: null, increasing_error_frequency: false, long_run_stability_score: 100, limitations: [] },
      braking: [],
      throttle: {},
      steering: {}
    },
    findings: [],
    provenance: {},
    report: {},
    analysis_version: "test",
    ...overrides
  };
}

function response(status: number, body?: unknown): typeof fetch {
  return vi.fn(async () => {
    const init: ResponseInit = { status };
    if (body !== undefined) init.headers = { "content-type": "application/json" };
    return new Response(body === undefined ? null : JSON.stringify(body), init);
  }) as unknown as typeof fetch;
}

describe("saved-session request classification", () => {
  it("uses the list summary contract without fetching every session detail", async () => {
    const request = response(200, {
      items: [{
        id: "summary-one", title: "Test circuit · Practice", game_id: "test_game", game_label: "Test game",
        track_id: "test-circuit", track_name: "Test circuit", car_id: "unknown", car_class: "Open wheel",
        session_type: "Practice", input_device: "unknown", started_at: "2000-01-01T00:00:00Z", demo_data: false,
        analysis_status: "analyzed", lap_count: 1, clean_lap_count: 1, best_lap_ms: 90000, consistency_score: 100
      }]
    });
    await expect(getSessionSummaries(request)).resolves.toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts the normalized empty provenance contract", async () => {
    const result = await getSessionDetail("sanitized-session", response(200, sessionResponse()));
    expect(result.status).toBe("ok");
  });

  it("rejects the former response shape when provenance is absent", async () => {
    const payload = Object.fromEntries(Object.entries(sessionResponse()).filter(([key]) => key !== "provenance"));
    const result = await getSessionDetail("sanitized-session", response(200, payload));
    expect(result.status).toBe("invalid_response");
  });

  it("distinguishes not found, processing, server and invalid responses", async () => {
    await expect(getSessionDetail("missing", response(404))).resolves.toMatchObject({ status: "not_found" });
    await expect(getSessionDetail("pending", response(202))).resolves.toMatchObject({ status: "processing" });
    await expect(getSessionDetail("broken", response(503))).resolves.toMatchObject({ status: "server_error" });
    await expect(getSessionDetail("invalid", response(400))).resolves.toMatchObject({ status: "invalid_response" });
  });

  it("recognizes a valid response that is still processing", async () => {
    const result = await getSessionDetail("pending", response(200, sessionResponse({ analysis_status: "processing", metrics: { pace: null, stint: null, braking: null, throttle: null, steering: null } })));
    expect(result.status).toBe("processing");
  });

  it("reports an unreachable API without consulting collector state", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => { void input; throw new TypeError("offline"); });
    const result = await getSessionDetail("saved", request as unknown as typeof fetch);
    expect(result.status).toBe("unreachable");
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[0])).toContain("/v1/sessions/saved");
  });

  it("never invents telemetry for a physical saved session when its trace is unavailable", async () => {
    const physical = sessionResponse();
    const unavailable = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(getTelemetry(physical as never, [1], unavailable)).resolves.toEqual([]);
    await expect(getTelemetry({ ...physical, demo_data: true } as never, [1], unavailable)).resolves.toHaveLength(1);
  });
});
