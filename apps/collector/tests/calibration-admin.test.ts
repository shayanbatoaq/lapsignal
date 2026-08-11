import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { circuitSeedArtifactSchema, type CircuitSeedArtifact } from "@lapsignal/contracts";
import { describe, expect, it } from "vitest";
import { auditSeedPrivacy } from "../src/calibration-admin.js";

describe("built-in calibration promotion privacy", () => {
  it("validates every promoted seed and excludes personal, session, capture, and timestamp fields", () => {
    const directory = resolve(import.meta.dirname, "../../../data/circuit-seeds");
    const files = readdirSync(directory).filter((file) => file.endsWith(".seed.json"));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const seed = circuitSeedArtifactSchema.parse(JSON.parse(readFileSync(join(directory, file), "utf8")));
      expect(auditSeedPrivacy(seed)).toEqual({ valid: true, violations: [] });
      expect(JSON.stringify(seed)).not.toMatch(/session_uid|session_hash|capture_reference|generated_at|\.lsraw|lap_time/i);
    }
  });

  it("rejects promoted payloads containing session or capture metadata", () => {
    const unsafe = {
      provenance: {
        source: "built_in_telemetry_seed",
        description: "unsafe",
        calibration_method: "telemetry_derived_distance_bins",
        privacy: "normalized_non_personal",
        session_uid: "physical-session",
        capture_reference: "physical.lsraw"
      }
    } as unknown as CircuitSeedArtifact;
    const audit = auditSeedPrivacy(unsafe);
    expect(audit.valid).toBe(false);
    expect(audit.violations).toEqual(expect.arrayContaining([
      "/provenance/session_uid:forbidden_key",
      "/provenance/capture_reference:forbidden_key"
    ]));
  });
});
