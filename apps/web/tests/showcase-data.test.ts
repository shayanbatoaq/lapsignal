import { describe, expect, it } from "vitest";
import { sessionDetailSchema } from "@/lib/session-contract";
import { showcasePayloadBytes, showcaseSessions, showcaseTelemetry } from "@/lib/showcase-data";

describe("representative showcase dataset", () => {
  it("contains three schema-valid, namespaced Spa sessions", () => {
    expect(showcaseSessions).toHaveLength(3);
    for (const session of showcaseSessions) {
      expect(sessionDetailSchema.safeParse(session).success).toBe(true);
      expect(session.id).toMatch(/^showcase:/);
      expect(session.session_uid).toMatch(/^showcase:/);
      expect(session.track_id).toBe("spa-francorchamps");
      expect(session.laps).toHaveLength(8);
      expect(session.laps.filter((lap) => lap.valid).length).toBeGreaterThanOrEqual(2);
      expect(session.laps.some((lap) => !lap.valid)).toBe(true);
      expect(session.findings).toHaveLength(3);
    }
  });

  it("resolves evidence and derives pace values from its laps", () => {
    for (const session of showcaseSessions) {
      const clean = session.laps.filter((lap) => lap.valid && lap.lap_time_ms !== null);
      expect(session.metrics.pace.clean_laps).toBe(clean.length);
      expect(session.metrics.pace.best_lap_ms).toBe(Math.min(...clean.map((lap) => lap.lap_time_ms!)));
      const findingIds = new Set(session.findings.map((finding) => finding.id));
      expect(session.report.evidence_references.every((id) => findingIds.has(id))).toBe(true);
      for (const finding of session.findings) for (const evidence of finding.evidence) {
        expect(Number.isFinite(evidence.value)).toBe(true);
        expect(evidence.lap_numbers.every((lap) => session.laps.some((item) => item.lap_number === lap))).toBe(true);
      }
    }
  });

  it("keeps traces plausible, finite and bounded", () => {
    expect(showcasePayloadBytes).toBeLessThan(1_500_000);
    for (const traces of showcaseTelemetry.values()) for (const trace of traces) {
      expect(trace.samples.length).toBeLessThanOrEqual(180);
      for (const sample of trace.samples) {
        expect(Object.values(sample).every((value) => Number.isFinite(value))).toBe(true);
        expect(sample.speed_kph).toBeGreaterThanOrEqual(70);
        expect(sample.speed_kph).toBeLessThanOrEqual(360);
        expect(sample.throttle_0_1).toBeGreaterThanOrEqual(0);
        expect(sample.throttle_0_1).toBeLessThanOrEqual(1);
      }
    }
  });

  it("contains no local paths, capture names, provider bodies, secrets or personal telemetry IDs", () => {
    const serialized = JSON.stringify({ showcaseSessions, traces: [...showcaseTelemetry.values()] });
    expect(serialized).not.toMatch(/[A-Z]:\\|\/Users\/|\.lsraw|\.parquet|OPENROUTER|api[_-]?key|live-\d{8}/i);
    expect(serialized).not.toContain("Shayan Batoaq");
  });

  it("shows deterministic improvement across the three-session programme", () => {
    const [baseline, followUp, improved] = showcaseSessions;
    expect(baseline!.metrics.pace.best_lap_ms!).toBeGreaterThan(followUp!.metrics.pace.best_lap_ms!);
    expect(followUp!.metrics.pace.best_lap_ms!).toBeGreaterThan(improved!.metrics.pace.best_lap_ms!);
    expect(baseline!.metrics.pace.consistency_score).toBeLessThan(improved!.metrics.pace.consistency_score);
  });
});
