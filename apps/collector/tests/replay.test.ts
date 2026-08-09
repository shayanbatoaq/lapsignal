import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TelemetrySample } from "@lapsignal/contracts";
import { replayFixture } from "../src/replay.js";

const sample = {
  schema_version: 1, timestamp_ms: 1, received_at_ms: 2, game_id: "f1_2021", game_version: "1.18",
  adapter_version: "0.1.0", session_uid: "1", frame_id: 1, player_index: 0, track_id: null,
  car_id: null, car_class: null, session_type: null, input_device: "controller", lap_number: 1,
  lap_distance_m: 10, total_distance_m: 10, current_lap_time_ms: 100, last_lap_time_ms: null,
  sector: 1, position_x: null, position_y: null, position_z: null, yaw: null, pitch: null, roll: null,
  speed_kph: 200, throttle_0_1: 1, brake_0_1: 0, steer_minus1_1: 0, clutch_0_1: 0, gear: 6,
  rpm: 11000, drs: false, fuel_kg: null, tyre_wear: null, tyre_temperatures: null, surface_type: null,
  lap_invalid: false, packet_id: 6
} satisfies TelemetrySample;

afterEach(() => vi.unstubAllGlobals());

describe("fixture replay", () => {
  it("uses heartbeat and the normal batch ingestion endpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lapsignal-replay-"));
    const fixture = join(directory, "fixture.jsonl");
    await writeFile(fixture, `${JSON.stringify(sample)}\n`, "utf8");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(replayFixture(fixture, "http://local", directory, 100)).resolves.toEqual({ samples: 1, rejected: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://local/v1/collector/heartbeat");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://local/v1/ingest/batches");
  });
});
