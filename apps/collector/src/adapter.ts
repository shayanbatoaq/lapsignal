import type { TelemetrySample } from "@lapsignal/contracts";
import { trackName } from "./protocol/parser.js";
import type {
  CarDamageData,
  CarStatusData,
  LapData,
  MotionData,
  PacketHeader,
  ParsedPacket,
  ParticipantData,
  SessionData
} from "./protocol/types.js";

const SESSION_TYPES = [
  "Unknown", "P1", "P2", "P3", "Short Practice", "Q1", "Q2", "Q3",
  "Short Qualifying", "One-shot Qualifying", "Race", "Race 2", "Race 3", "Time Trial"
] as const;

export class F12021Adapter {
  private session: SessionData | null = null;
  private lap: LapData | null = null;
  private status: CarStatusData | null = null;
  private damage: CarDamageData | null = null;
  private motion: MotionData | null = null;
  private participant: ParticipantData | null = null;

  ingest(packet: ParsedPacket, receivedAtMs: number): TelemetrySample | null {
    switch (packet.kind) {
      case "session": this.session = packet.data; return null;
      case "lapData": this.lap = packet.data; return null;
      case "carStatus": this.status = packet.data; return null;
      case "carDamage": this.damage = packet.data; return null;
      case "motion": this.motion = packet.data; return null;
      case "participants": this.participant = packet.data; return null;
      case "carTelemetry": return this.sample(packet.header, packet.data, receivedAtMs);
      default: return null;
    }
  }

  private sample(
    header: PacketHeader,
    telemetry: Extract<ParsedPacket, { kind: "carTelemetry" }>["data"],
    receivedAtMs: number
  ): TelemetrySample {
    const track = trackName(this.session?.trackId);
    const lap = this.lap;
    return {
      schema_version: 1,
      timestamp_ms: Math.max(0, Math.round(header.sessionTime * 1000)),
      received_at_ms: receivedAtMs,
      game_id: "f1_2021",
      game_version: `${header.gameMajorVersion}.${header.gameMinorVersion}`,
      adapter_version: "0.1.0",
      session_uid: header.sessionUid,
      frame_id: header.frameIdentifier,
      player_index: header.playerCarIndex,
      track_id: track?.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") ?? null,
      car_id: this.participant ? `team-${this.participant.teamId}` : null,
      car_class: this.session?.formula === 0 ? "Formula" : "Formula legacy",
      session_type: this.session ? (SESSION_TYPES[this.session.sessionType] ?? "Unknown") : null,
      input_device: "unknown",
      lap_number: lap?.currentLapNumber ?? 0,
      lap_distance_m: lap?.lapDistanceM ?? null,
      total_distance_m: lap?.totalDistanceM ?? null,
      current_lap_time_ms: lap?.currentLapTimeMs ?? null,
      last_lap_time_ms: lap?.lastLapTimeMs ?? null,
      sector: lap?.sector ?? null,
      position_x: this.motion?.positionX ?? null,
      position_y: this.motion?.positionY ?? null,
      position_z: this.motion?.positionZ ?? null,
      yaw: this.motion?.yaw ?? null,
      pitch: this.motion?.pitch ?? null,
      roll: this.motion?.roll ?? null,
      speed_kph: telemetry.speedKph,
      throttle_0_1: clamp(telemetry.throttle, 0, 1),
      brake_0_1: clamp(telemetry.brake, 0, 1),
      steer_minus1_1: clamp(telemetry.steer, -1, 1),
      clutch_0_1: clamp(telemetry.clutch / 100, 0, 1),
      gear: telemetry.gear,
      rpm: telemetry.rpm,
      drs: telemetry.drs,
      fuel_kg: this.status?.fuelKg ?? null,
      tyre_wear: this.damage?.tyreWearPercent ?? null,
      tyre_temperatures: telemetry.tyreTemperatures,
      surface_type: telemetry.surfaceType,
      lap_invalid: lap?.currentLapInvalid ?? false,
      packet_id: header.packetId
    };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
