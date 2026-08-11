import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TelemetrySample } from "@lapsignal/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { CircuitCalibrationManager } from "../src/calibration.js";

const directories: string[] = [];
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe("circuit calibration persistence", () => {
  it("persists a completed Baku lap and reloads only the matching fingerprint", () => {
    const directory = mkdtempSync(join(tmpdir(), "lapsignal-calibration-"));
    directories.push(directory);
    const manager = new CircuitCalibrationManager(directory);
    completeLap(20, "baku", 5994, "baku-session").forEach((sample) => manager.ingest(sample, "capture.lsraw", false));
    manager.finalize();
    const [result] = manager.generatedArtifacts();
    expect(result?.created).toBe(true);
    expect(result?.artifact).toMatchObject({ game_track_id: 20, track_id: "baku", layout_fingerprint: "f1_2021:2021:20:5994" });
    expect(result?.artifact.provenance.capture_reference).toBe("capture.lsraw");
    expect(JSON.parse(readFileSync(result!.artifactPath, "utf8")).points).toHaveLength(400);

    const restarted = new CircuitCalibrationManager(directory);
    restarted.ingest(completeLap(20, "baku", 5994, "second-session")[0]!, null, false);
    restarted.finalize();
    expect(restarted.generatedArtifacts()[0]).toMatchObject({
      created: true,
      artifact: { game_track_id: 20, quality: { source_session_count: 2 } }
    });

    const spa = new CircuitCalibrationManager(directory);
    completeLap(10, "spa-francorchamps", 7003, "spa-session").slice(0, 150).forEach((sample) => spa.ingest(sample, null, false));
    spa.finalize();
    expect(spa.generatedArtifacts()).toEqual([]);
  });
});

function completeLap(gameTrackId: number, trackId: string, length: number, sessionUid: string): TelemetrySample[] {
  const rows = Array.from({ length: 400 }, (_, index) => sample(gameTrackId, trackId, length, sessionUid, 1, index));
  rows.push(sample(gameTrackId, trackId, length, sessionUid, 2, 0));
  return rows;
}

function sample(gameTrackId: number, trackId: string, length: number, sessionUid: string, lapNumber: number, index: number): TelemetrySample {
  const progress = index / 399;
  const angle = progress * Math.PI * 2;
  return {
    schema_version: 1,
    timestamp_ms: (lapNumber - 1) * 30_000 + index * 50,
    received_at_ms: 1_800_000_000_000 + index,
    game_id: "f1_2021",
    game_version: "1.18",
    packet_format: 2021,
    adapter_version: "0.1.0",
    session_uid: sessionUid,
    frame_id: (lapNumber - 1) * 1000 + index,
    player_index: 0,
    game_track_id: gameTrackId,
    track_id: trackId,
    track_name: trackId,
    track_length_m: length,
    car_id: "williams",
    car_class: "F1 Modern",
    session_type: "Time Trial",
    input_device: "controller",
    lap_number: lapNumber,
    lap_distance_m: progress * length,
    total_distance_m: progress * length,
    current_lap_time_ms: index * 50,
    last_lap_time_ms: lapNumber > 1 ? 90_000 : null,
    sector: 1,
    position_x: Math.cos(angle) * 400 + Math.sin(angle * 3) * 80,
    position_y: 0,
    position_z: Math.sin(angle) * 250,
    yaw: angle,
    pitch: 0,
    roll: 0,
    speed_kph: 220,
    throttle_0_1: 0.8,
    brake_0_1: 0,
    steer_minus1_1: 0,
    clutch_0_1: 0,
    gear: 7,
    rpm: 11_000,
    drs: false,
    fuel_kg: 20,
    tyre_wear: [1, 1, 1, 1],
    tyre_temperatures: [90, 90, 90, 90],
    surface_type: [0, 0, 0, 0],
    lap_invalid: false,
    pit_status: 0,
    driver_status: 4,
    packet_id: 6
  };
}
