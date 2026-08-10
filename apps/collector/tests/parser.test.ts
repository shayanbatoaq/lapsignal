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

  it("parses Spa, weather, length, formula and assists from the session packet", () => {
    const buffer=packetBuffer(1,625,3);
    buffer.writeUInt8(0,24);buffer.writeInt8(32,25);buffer.writeInt8(21,26);buffer.writeUInt16LE(7004,28);
    buffer.writeUInt8(13,30);buffer.writeInt8(10,31);buffer.writeUInt8(0,32);
    buffer.writeUInt8(1,616);buffer.writeUInt8(0,617);buffer.writeUInt8(3,618);buffer.writeUInt8(2,623);
    const parsed=parseF12021Packet(buffer);
    expect(parsed.kind).toBe("session");
    if(parsed.kind!=="session")throw new Error("wrong packet kind");
    expect(parsed.data).toMatchObject({trackId:10,trackLengthM:7004,sessionType:13,formula:0,weather:0});
    expect(parsed.data.assists).toMatchObject({steering:1,braking:0,gearbox:3,racingLine:2});
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
