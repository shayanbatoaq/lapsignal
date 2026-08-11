import { describe, expect, it } from "vitest";
import { F12021Adapter } from "../src/adapter.js";
import { parseF12021Packet } from "../src/protocol/parser.js";
import { packetBuffer } from "./helpers.js";

describe("F1 2021 adapter map telemetry", () => {
  it("exposes Baku Session identity and selected-player Motion coordinates", () => {
    const adapter = new F12021Adapter();
    const session = packetBuffer(1, 625, 3);
    session.writeUInt16LE(5994, 28);
    session.writeInt8(20, 31);
    adapter.ingest(parseF12021Packet(session), 1);

    const lap = packetBuffer(2, 970, 3);
    const lapOffset = 24 + 3 * 43;
    lap.writeFloatLE(1234.5, lapOffset + 12);
    lap.writeUInt8(2, lapOffset + 25);
    lap.writeUInt8(1, lapOffset + 28);
    adapter.ingest(parseF12021Packet(lap), 2);

    const motion = packetBuffer(0, 1464, 3);
    const motionOffset = 24 + 3 * 60;
    motion.writeFloatLE(321.25, motionOffset);
    motion.writeFloatLE(12.5, motionOffset + 4);
    motion.writeFloatLE(-87.75, motionOffset + 8);
    motion.writeFloatLE(1.25, motionOffset + 48);
    adapter.ingest(parseF12021Packet(motion), 3);

    const sample = adapter.ingest(parseF12021Packet(packetBuffer(6, 1347, 3)), 4);
    expect(sample).toMatchObject({
      packet_format: 2021,
      game_track_id: 20,
      track_id: "baku",
      track_name: "Baku",
      track_length_m: 5994,
      player_index: 3,
      lap_number: 2,
      lap_distance_m: 1234.5,
      position_x: 321.25,
      position_y: 12.5,
      position_z: -87.75,
      yaw: 1.25
    });
  });

  it("clears cached circuit and Motion data when the Session UID changes", () => {
    const adapter = new F12021Adapter();
    const session = packetBuffer(1, 625, 0);
    session.writeInt8(20, 31);
    adapter.ingest(parseF12021Packet(session), 1);
    const nextSessionTelemetry = packetBuffer(6, 1347, 0);
    nextSessionTelemetry.writeBigUInt64LE(999999n, 6);
    const sample = adapter.ingest(parseF12021Packet(nextSessionTelemetry), 2);
    expect(sample).toMatchObject({ session_uid: "999999", game_track_id: null, track_id: null, position_x: null, position_z: null });
  });
});
