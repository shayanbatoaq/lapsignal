import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiDelivery } from "../src/delivery.js";
import type { TelemetrySample } from "@lapsignal/contracts";

const logger = { info: vi.fn(), warn: vi.fn() };
const sample = {
  schema_version: 1, timestamp_ms: 1, received_at_ms: 2, game_id: "f1_2021", game_version: "1.18",
  adapter_version: "0.1.0", session_uid: "1", frame_id: 1, player_index: 0, track_id: null,
  car_id: null, car_class: null, session_type: null, input_device: "unknown", lap_number: 1,
  lap_distance_m: null, total_distance_m: null, current_lap_time_ms: null, last_lap_time_ms: null,
  sector: null, position_x: null, position_y: null, position_z: null, yaw: null, pitch: null, roll: null,
  speed_kph: 200, throttle_0_1: 1, brake_0_1: 0, steer_minus1_1: 0, clutch_0_1: 0, gear: 6,
  rpm: 11000, drs: false, fuel_kg: null, tyre_wear: null, tyre_temperatures: null, surface_type: null,
  lap_invalid: false, packet_id: 6
} satisfies TelemetrySample;

afterEach(() => vi.unstubAllGlobals());

describe("API delivery", () => {
  it("keeps a bounded local queue and reconnects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lapsignal-delivery-"));
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = new ApiDelivery("http://local", "test", join(directory, "queue.jsonl"), logger, 2);
    delivery.enqueue(sample);
    delivery.enqueue({ ...sample, frame_id: 2 });
    delivery.enqueue({ ...sample, frame_id: 3 });
    expect(delivery.queued()).toBe(2);
    expect(await delivery.flush()).toBe(0);
    expect(await delivery.flush()).toBe(2);
    expect(delivery.queued()).toBe(0);
  });
});
