import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TelemetrySample } from "@lapsignal/contracts";
import { replayFixture } from "../src/replay.js";
import { packetBuffer } from "./helpers.js";

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

    await expect(replayFixture(fixture, "http://local", directory, 100)).resolves.toEqual({
      samples: 1, rejected: 0, sessions: 1, finalized: 1, queued: 0
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://local/v1/collector/heartbeat");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://local/v1/ingest/batches");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://local/v1/collector/session-events");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      event: "session_ended", interrupted: false, raw_capture_path: null,
      normalized_capture_path: fixture
    });
  });

  it("parses a raw F1 2021 capture through the adapter and finalizes after delivery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lapsignal-raw-replay-"));
    const capture = join(directory, "physical.lsraw");
    const packets = [packetBuffer(1, 625, 3), packetBuffer(2, 970, 3), packetBuffer(6, 1347, 3)];
    packets[0]!.writeUInt16LE(7004, 28);
    packets[0]!.writeInt8(10, 31);
    const raw = Buffer.concat(packets.flatMap((packet, index) => {
      const prefix = Buffer.alloc(12);
      prefix.writeUInt32LE(packet.length, 0);
      prefix.writeBigUInt64LE(BigInt(1000 + index), 4);
      return [prefix, packet];
    }));
    await writeFile(capture, raw);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(replayFixture(capture, "http://local", directory, 100)).resolves.toEqual({
      samples: 1, rejected: 0, sessions: 1, finalized: 1, queued: 0
    });
    const ingest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(ingest.samples[0]).toMatchObject({ game_track_id: 10, track_id: "spa-francorchamps" });
    const finalized = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(finalized).toMatchObject({ raw_capture_path: capture, normalized_capture_path: null });
  });
});
