import {
  F1_2021_PACKET_SIZES,
  PACKET_NAMES,
  type CarStatusData,
  type CarDamageData,
  type CarTelemetryData,
  type EventData,
  type FinalClassificationData,
  type LapData,
  type MotionData,
  type PacketHeader,
  type ParsedPacket,
  type ParticipantData,
  type SessionData
} from "./types.js";
import { trackValue } from "./catalogs.js";

export class PacketParseError extends Error {
  constructor(
    message: string,
    public readonly code: "truncated" | "wrong_format" | "unknown_packet" | "invalid_player"
  ) {
    super(message);
    this.name = "PacketParseError";
  }
}

const HEADER_SIZE = 24;
export function trackName(trackId: number | null | undefined): string | null {
  return trackId == null ? null : trackValue(trackId).name;
}

export function parseHeader(buffer: Buffer): PacketHeader {
  if (buffer.length < HEADER_SIZE) throw new PacketParseError("packet header is truncated", "truncated");
  const packetFormat = buffer.readUInt16LE(0);
  if (packetFormat !== 2021) {
    throw new PacketParseError(`unsupported packet format ${packetFormat}; expected 2021`, "wrong_format");
  }
  const packetId = buffer.readUInt8(5);
  if (!(packetId in F1_2021_PACKET_SIZES)) {
    throw new PacketParseError(`unknown F1 2021 packet id ${packetId}`, "unknown_packet");
  }
  return {
    packetFormat,
    gameMajorVersion: buffer.readUInt8(2),
    gameMinorVersion: buffer.readUInt8(3),
    packetVersion: buffer.readUInt8(4),
    packetId,
    sessionUid: buffer.readBigUInt64LE(6).toString(),
    sessionTime: buffer.readFloatLE(14),
    frameIdentifier: buffer.readUInt32LE(18),
    playerCarIndex: buffer.readUInt8(22),
    secondaryPlayerCarIndex: buffer.readUInt8(23)
  };
}

function requirePacketSize(buffer: Buffer, header: PacketHeader): void {
  const expected = F1_2021_PACKET_SIZES[header.packetId];
  if (expected == null || buffer.length < expected) {
    throw new PacketParseError(
      `${PACKET_NAMES[header.packetId] ?? "unknown"} packet is ${buffer.length} bytes; expected ${expected}`,
      "truncated"
    );
  }
  if (header.playerCarIndex > 21 && ![1, 3, 8].includes(header.packetId)) {
    throw new PacketParseError(`player car index ${header.playerCarIndex} is unavailable`, "invalid_player");
  }
}

function playerOffset(header: PacketHeader, recordSize: number, prefix = HEADER_SIZE): number {
  return prefix + header.playerCarIndex * recordSize;
}

function parseMotion(buffer: Buffer, header: PacketHeader): MotionData {
  const offset = playerOffset(header, 60);
  return {
    positionX: buffer.readFloatLE(offset),
    positionY: buffer.readFloatLE(offset + 4),
    positionZ: buffer.readFloatLE(offset + 8),
    yaw: buffer.readFloatLE(offset + 48),
    pitch: buffer.readFloatLE(offset + 52),
    roll: buffer.readFloatLE(offset + 56)
  };
}

function parseSession(buffer: Buffer): SessionData {
  return {
    weather: buffer.readUInt8(24),
    trackTemperatureC: buffer.readInt8(25),
    airTemperatureC: buffer.readInt8(26),
    totalLaps: buffer.readUInt8(27),
    trackLengthM: buffer.readUInt16LE(28),
    sessionType: buffer.readUInt8(30),
    trackId: buffer.readInt8(31),
    formula: buffer.readUInt8(32),
    assists: {
      steering: buffer.readUInt8(616), braking: buffer.readUInt8(617),
      gearbox: buffer.readUInt8(618), pit: buffer.readUInt8(619),
      pitRelease: buffer.readUInt8(620), ers: buffer.readUInt8(621),
      drs: buffer.readUInt8(622), racingLine: buffer.readUInt8(623),
      racingLineType: buffer.readUInt8(624)
    }
  };
}

function parseLapData(buffer: Buffer, header: PacketHeader): LapData {
  const offset = playerOffset(header, 43);
  return {
    lastLapTimeMs: buffer.readUInt32LE(offset),
    currentLapTimeMs: buffer.readUInt32LE(offset + 4),
    sector1TimeMs: buffer.readUInt16LE(offset + 8),
    sector2TimeMs: buffer.readUInt16LE(offset + 10),
    lapDistanceM: buffer.readFloatLE(offset + 12),
    totalDistanceM: buffer.readFloatLE(offset + 16),
    carPosition: buffer.readUInt8(offset + 24),
    currentLapNumber: buffer.readUInt8(offset + 25),
    pitStatus: buffer.readUInt8(offset + 26),
    sector: buffer.readUInt8(offset + 28),
    currentLapInvalid: buffer.readUInt8(offset + 29) === 1,
    driverStatus: buffer.readUInt8(offset + 35),
    resultStatus: buffer.readUInt8(offset + 36)
  };
}

function parseTelemetry(buffer: Buffer, header: PacketHeader): CarTelemetryData {
  const offset = playerOffset(header, 60);
  return {
    speedKph: buffer.readUInt16LE(offset),
    throttle: buffer.readFloatLE(offset + 2),
    steer: buffer.readFloatLE(offset + 6),
    brake: buffer.readFloatLE(offset + 10),
    clutch: buffer.readUInt8(offset + 14),
    gear: buffer.readInt8(offset + 15),
    rpm: buffer.readUInt16LE(offset + 16),
    drs: buffer.readUInt8(offset + 18) === 1,
    tyreTemperatures: Array.from({ length: 4 }, (_, index) => buffer.readUInt8(offset + 33 + index)),
    surfaceType: Array.from({ length: 4 }, (_, index) => buffer.readUInt8(offset + 56 + index))
  };
}

function parseStatus(buffer: Buffer, header: PacketHeader): CarStatusData {
  const offset = playerOffset(header, 47);
  return {
    fuelKg: buffer.readFloatLE(offset + 5),
    drsAllowed: buffer.readUInt8(offset + 22) === 1,
    actualTyreCompound: buffer.readUInt8(offset + 25),
    tyreAgeLaps: buffer.readUInt8(offset + 27),
    ersStoreEnergyJ: buffer.readFloatLE(offset + 29)
  };
}

function parseDamage(buffer: Buffer, header: PacketHeader): CarDamageData {
  const offset = playerOffset(header, 39);
  return {
    tyreWearPercent: Array.from({ length: 4 }, (_, index) =>
      buffer.readFloatLE(offset + index * 4)
    )
  };
}

function parseParticipant(buffer: Buffer, header: PacketHeader): ParticipantData {
  const offset = 25 + header.playerCarIndex * 56;
  return {
    activeCars: buffer.readUInt8(24),
    aiControlled: buffer.readUInt8(offset) === 1,
    driverId: buffer.readUInt8(offset + 1),
    teamId: buffer.readUInt8(offset + 3),
    raceNumber: buffer.readUInt8(offset + 5),
    name: buffer.subarray(offset + 7, offset + 55).toString("utf8").replaceAll("\0", "").trim(),
    telemetryPublic: buffer.readUInt8(offset + 55) === 1
  };
}

function parseEvent(buffer: Buffer): EventData {
  const code = buffer.subarray(24, 28).toString("ascii");
  if (code === "FTLP") {
    return { code, vehicleIndex: buffer.readUInt8(28), lapTimeSeconds: buffer.readFloatLE(29) };
  }
  if (["RTMT", "TMPT", "RCWN", "DTSV", "SGSV"].includes(code)) {
    return { code, vehicleIndex: buffer.readUInt8(28) };
  }
  return { code };
}

function parseFinalClassification(buffer: Buffer, header: PacketHeader): FinalClassificationData {
  const offset = 25 + header.playerCarIndex * 37;
  return {
    cars: buffer.readUInt8(24),
    position: buffer.readUInt8(offset),
    laps: buffer.readUInt8(offset + 1),
    resultStatus: buffer.readUInt8(offset + 5),
    bestLapTimeMs: buffer.readUInt32LE(offset + 6),
    totalRaceTimeSeconds: buffer.readDoubleLE(offset + 10)
  };
}

export function parseF12021Packet(buffer: Buffer): ParsedPacket {
  const header = parseHeader(buffer);
  requirePacketSize(buffer, header);
  switch (header.packetId) {
    case 0: return { kind: "motion", header, data: parseMotion(buffer, header) };
    case 1: return { kind: "session", header, data: parseSession(buffer) };
    case 2: return { kind: "lapData", header, data: parseLapData(buffer, header) };
    case 3: return { kind: "event", header, data: parseEvent(buffer) };
    case 4: return { kind: "participants", header, data: parseParticipant(buffer, header) };
    case 6: return { kind: "carTelemetry", header, data: parseTelemetry(buffer, header) };
    case 7: return { kind: "carStatus", header, data: parseStatus(buffer, header) };
    case 8: return { kind: "finalClassification", header, data: parseFinalClassification(buffer, header) };
    case 10: return { kind: "carDamage", header, data: parseDamage(buffer, header) };
    default: return { kind: "supportedOther", header, data: {} };
  }
}
