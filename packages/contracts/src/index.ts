import { z } from "zod";

export const inputDeviceSchema = z.enum(["controller", "wheel", "unknown"]);

const nullableNumber = z.number().finite().nullable();

export const telemetrySampleSchema = z.object({
  schema_version: z.literal(1),
  timestamp_ms: z.number().int().nonnegative(),
  received_at_ms: z.number().int().nonnegative(),
  game_id: z.string().min(1),
  game_version: z.string().min(1),
  adapter_version: z.string().min(1),
  session_uid: z.string().min(1),
  frame_id: z.number().int().nonnegative(),
  player_index: z.number().int().min(0).max(21),
  track_id: z.string().nullable(),
  car_id: z.string().nullable(),
  car_class: z.string().nullable(),
  session_type: z.string().nullable(),
  input_device: inputDeviceSchema,
  lap_number: z.number().int().nonnegative(),
  lap_distance_m: nullableNumber,
  total_distance_m: nullableNumber,
  current_lap_time_ms: nullableNumber,
  last_lap_time_ms: nullableNumber,
  sector: z.number().int().min(0).max(3).nullable(),
  position_x: nullableNumber,
  position_y: nullableNumber,
  position_z: nullableNumber,
  yaw: nullableNumber,
  pitch: nullableNumber,
  roll: nullableNumber,
  speed_kph: nullableNumber,
  throttle_0_1: z.number().min(0).max(1).nullable(),
  brake_0_1: z.number().min(0).max(1).nullable(),
  steer_minus1_1: z.number().min(-1).max(1).nullable(),
  clutch_0_1: z.number().min(0).max(1).nullable(),
  gear: z.number().int().min(-1).max(8).nullable(),
  rpm: z.number().int().nonnegative().nullable(),
  drs: z.boolean().nullable(),
  fuel_kg: nullableNumber,
  tyre_wear: z.array(nullableNumber).length(4).nullable(),
  tyre_temperatures: z.array(nullableNumber).length(4).nullable(),
  surface_type: z.array(z.number().int()).length(4).nullable(),
  lap_invalid: z.boolean(),
  packet_id: z.number().int().min(0).max(255)
});

export const evidenceSchema = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  reference_value: z.number().nullable(),
  delta: z.number().nullable(),
  lap_numbers: z.array(z.number().int()),
  zone_id: z.string().nullable()
});

export const findingSchema = z.object({
  id: z.string(),
  type: z.string(),
  priority: z.number().int().min(1),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  plain_language: z.string(),
  recommended_action: z.string(),
  evidence: z.array(evidenceSchema).min(1),
  limitations: z.array(z.string()),
  analysis_version: z.string()
});

export const collectorHeartbeatSchema = z.object({
  collector_id: z.string().min(1),
  collector_version: z.string(),
  adapter_version: z.string(),
  telemetry_schema_version: z.literal(1),
  mode: z.enum(["live", "replay"]),
  session_uid: z.string().nullable(),
  packet_rate_hz: z.number().nonnegative(),
  dropped_frames: z.number().int().nonnegative(),
  out_of_order_frames: z.number().int().nonnegative(),
  last_packet_at: z.string().datetime().nullable()
});

export const ingestBatchSchema = z.object({
  collector_id: z.string().min(1),
  samples: z.array(telemetrySampleSchema).min(1).max(1000)
});

export type TelemetrySample = z.infer<typeof telemetrySampleSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type CollectorHeartbeat = z.infer<typeof collectorHeartbeatSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;
