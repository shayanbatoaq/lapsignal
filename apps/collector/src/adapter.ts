import type { TelemetrySample } from "@lapsignal/contracts";
import { trackValue, teamValue, sessionTypeValue, formulaValue, weatherValue, assistValue, gearboxAssistValue, racingLineValue } from "./protocol/catalogs.js";
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
    const track = this.session ? trackValue(this.session.trackId) : null;
    const team = this.participant ? teamValue(this.participant.teamId) : null;
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
      track_id: track?.slug ?? null,
      track_name: track?.name ?? null,
      track_length_m: this.session?.trackLengthM ?? null,
      weather: this.session ? weatherValue(this.session.weather).name : null,
      car_id: team?.slug ?? null,
      team_id: team?.id ?? null,
      team_name: team?.name ?? null,
      car_number: this.participant?.raceNumber ?? null,
      formula: this.session ? formulaValue(this.session.formula).name : null,
      car_class: this.session ? formulaValue(this.session.formula).name : null,
      session_type: this.session ? sessionTypeValue(this.session.sessionType).name : null,
      assist_profile: this.session ? {
        steering: assistValue(this.session.assists.steering), braking: assistValue(this.session.assists.braking),
        gearbox: gearboxAssistValue(this.session.assists.gearbox), pit: assistValue(this.session.assists.pit),
        pit_release: assistValue(this.session.assists.pitRelease), ers: assistValue(this.session.assists.ers),
        drs: assistValue(this.session.assists.drs), racing_line: racingLineValue(this.session.assists.racingLine),
        racing_line_type: assistValue(this.session.assists.racingLineType)
      } : null,
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
