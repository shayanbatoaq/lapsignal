import { describe, expect, it } from "vitest";
import fixture from "./fixtures/car-telemetry.json" with { type: "json" };
import { PacketParseError, parseF12021Packet, parseHeader } from "../src/protocol/parser.js";
import { packetBuffer } from "./helpers.js";

describe("F1 2021 parser", () => {
  it("parses the verified fixture for the selected player", () => {
    const parsed = parseF12021Packet(packetBuffer());
    expect(parsed.kind).toBe("carTelemetry");
    if (parsed.kind !== "carTelemetry") throw new Error("wrong packet kind");
    expect(parsed.header.sessionUid).toBe(fixture.sessionUid);
    expect(parsed.header.playerCarIndex).toBe(3);
    expect(parsed.data.speedKph).toBe(287);
    expect(parsed.data.throttle).toBeCloseTo(0.84);
    expect(parsed.data.tyreTemperatures).toEqual([92, 93, 91, 94]);
  });

  it("reads different player array indices", () => {
    const buffer = packetBuffer(6, 1347, 8);
    const parsed = parseF12021Packet(buffer);
    expect(parsed.kind === "carTelemetry" && parsed.data.rpm).toBe(11980);
  });

  it("rejects a wrong packet format", () => {
    const buffer = packetBuffer();
    buffer.writeUInt16LE(2022, 0);
    expect(() => parseHeader(buffer)).toThrowError(expect.objectContaining({ code: "wrong_format" }));
  });

  it("rejects truncated packets", () => {
    expect(() => parseF12021Packet(packetBuffer().subarray(0, 80))).toThrowError(
      expect.objectContaining({ code: "truncated" })
    );
  });

  it("rejects unknown packet IDs safely", () => {
    const buffer = packetBuffer();
    buffer.writeUInt8(99, 5);
    expect(() => parseHeader(buffer)).toThrowError(PacketParseError);
  });
});
