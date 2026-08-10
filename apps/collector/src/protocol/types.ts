export const F1_2021_PACKET_SIZES: Record<number, number> = {
  0: 1464,
  1: 625,
  2: 970,
  3: 36,
  4: 1257,
  5: 1102,
  6: 1347,
  7: 1058,
  8: 839,
  9: 1191,
  10: 882,
  11: 1155
};

export const PACKET_NAMES: Record<number, string> = {
  0: "motion",
  1: "session",
  2: "lapData",
  3: "event",
  4: "participants",
  5: "carSetups",
  6: "carTelemetry",
  7: "carStatus",
  8: "finalClassification",
  9: "lobbyInfo",
  10: "carDamage",
  11: "sessionHistory"
};

export interface PacketHeader {
  packetFormat: number;
  gameMajorVersion: number;
  gameMinorVersion: number;
  packetVersion: number;
  packetId: number;
  sessionUid: string;
  sessionTime: number;
  frameIdentifier: number;
  playerCarIndex: number;
  secondaryPlayerCarIndex: number;
}

export type ParsedPacket =
  | { kind: "motion"; header: PacketHeader; data: MotionData }
  | { kind: "session"; header: PacketHeader; data: SessionData }
  | { kind: "lapData"; header: PacketHeader; data: LapData }
  | { kind: "event"; header: PacketHeader; data: EventData }
  | { kind: "participants"; header: PacketHeader; data: ParticipantData }
  | { kind: "carTelemetry"; header: PacketHeader; data: CarTelemetryData }
  | { kind: "carStatus"; header: PacketHeader; data: CarStatusData }
  | { kind: "carDamage"; header: PacketHeader; data: CarDamageData }
  | { kind: "finalClassification"; header: PacketHeader; data: FinalClassificationData }
  | { kind: "supportedOther"; header: PacketHeader; data: Record<string, never> };

export interface MotionData {
  positionX: number;
  positionY: number;
  positionZ: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface SessionData {
  weather: number;
  trackTemperatureC: number;
  airTemperatureC: number;
  totalLaps: number;
  trackLengthM: number;
  sessionType: number;
  trackId: number;
  formula: number;
  assists: AssistProfile;
}

export interface AssistProfile {
  steering: number; braking: number; gearbox: number; pit: number;
  pitRelease: number; ers: number; drs: number; racingLine: number; racingLineType: number;
}

export interface LapData {
  lastLapTimeMs: number;
  currentLapTimeMs: number;
  sector1TimeMs: number;
  sector2TimeMs: number;
  lapDistanceM: number;
  totalDistanceM: number;
  carPosition: number;
  currentLapNumber: number;
  pitStatus: number;
  sector: number;
  currentLapInvalid: boolean;
  driverStatus: number;
  resultStatus: number;
}

export interface CarTelemetryData {
  speedKph: number;
  throttle: number;
  steer: number;
  brake: number;
  clutch: number;
  gear: number;
  rpm: number;
  drs: boolean;
  tyreTemperatures: number[];
  surfaceType: number[];
}

export interface CarStatusData {
  fuelKg: number;
  drsAllowed: boolean;
  actualTyreCompound: number;
  tyreAgeLaps: number;
  ersStoreEnergyJ: number;
}

export interface CarDamageData {
  tyreWearPercent: number[];
}

export interface ParticipantData {
  activeCars: number;
  aiControlled: boolean;
  driverId: number;
  teamId: number;
  raceNumber: number;
  name: string;
  telemetryPublic: boolean;
}

export interface EventData {
  code: string;
  vehicleIndex?: number;
  lapTimeSeconds?: number;
}

export interface FinalClassificationData {
  cars: number;
  position: number;
  laps: number;
  resultStatus: number;
  bestLapTimeMs: number;
  totalRaceTimeSeconds: number;
}
