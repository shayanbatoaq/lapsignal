import { z } from "zod";

export const inputDeviceSchema = z.enum(["controller", "wheel", "unknown"]);

const nullableNumber = z.number().finite().nullable();

export const telemetrySampleSchema = z.object({
  schema_version: z.literal(1),
  timestamp_ms: z.number().int().nonnegative(),
  received_at_ms: z.number().int().nonnegative(),
  game_id: z.string().min(1),
  game_version: z.string().min(1),
  packet_format: z.number().int().positive().optional(),
  adapter_version: z.string().min(1),
  session_uid: z.string().min(1),
  frame_id: z.number().int().nonnegative(),
  player_index: z.number().int().min(0).max(21),
  game_track_id: z.number().int().min(-1).max(127).nullable().optional(),
  track_id: z.string().nullable(),
  car_id: z.string().nullable(),
  car_class: z.string().nullable(),
  session_type: z.string().nullable(),
  track_name: z.string().nullable().optional(),
  track_length_m: nullableNumber.optional(),
  weather: z.string().nullable().optional(),
  formula: z.string().nullable().optional(),
  team_id: z.number().int().nullable().optional(),
  team_name: z.string().nullable().optional(),
  car_number: z.number().int().nullable().optional(),
  assist_profile: z.record(z.string(), z.string()).nullable().optional(),
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
  pit_status: z.number().int().min(0).max(2).nullable().optional(),
  driver_status: z.number().int().min(0).max(4).nullable().optional(),
  packet_id: z.number().int().min(0).max(255)
});

export const circuitCalibrationPointSchema = z.object({
  progress: z.number().min(0).max(1),
  x: z.number().finite(),
  y: z.number().finite()
});

export const circuitCalibrationTransformSchema = z.object({
  scale: z.number().finite().positive(),
  offset_x: z.number().finite(),
  offset_y: z.number().finite(),
  invert_z: z.literal(true)
});

export const circuitCalibrationQualitySchema = z.object({
  bin_count: z.number().int().min(80).max(1000),
  covered_bins: z.number().int().nonnegative(),
  coverage_ratio: z.number().min(0).max(1),
  sample_count: z.number().int().positive(),
  rejected_samples: z.number().int().nonnegative(),
  lap_number: z.number().int().positive().optional(),
  source_session_count: z.number().int().positive().optional(),
  maximum_gap_bins: z.number().int().nonnegative().optional(),
  closure_distance_svg: z.number().finite().nonnegative().optional(),
  quality_score: z.number().finite().nonnegative().optional()
}).strict();

const legacyCalibrationProvenanceSchema = z.object({
  source: z.literal("local_f1_2021_motion_packets"),
  description: z.string().min(1),
  capture_reference: z.string().min(1).nullable(),
  session_hash: z.string().regex(/^[a-f0-9]{16}$/),
  generated_at: z.string().datetime()
}).strict();

const progressiveCalibrationProvenanceSchema = z.object({
  source: z.literal("local_progressive_f1_2021_motion_packets"),
  description: z.string().min(1),
  capture_reference: z.string().min(1).nullable(),
  generated_at: z.string().datetime(),
  calibration_method: z.literal("bounded_distance_bin_weighted_median")
}).strict();

export const builtInCalibrationProvenanceSchema = z.object({
  source: z.literal("built_in_telemetry_seed"),
  description: z.string().min(1),
  calibration_method: z.literal("telemetry_derived_distance_bins"),
  privacy: z.literal("normalized_non_personal")
}).strict();

export const circuitCalibrationArtifactSchema = z.object({
  schema_version: z.literal(1),
  calibration_id: z.string().min(1),
  game_id: z.string().min(1),
  packet_format: z.number().int().positive(),
  game_track_id: z.number().int().min(0).max(127),
  track_id: z.string().min(1),
  track_name: z.string().min(1),
  track_length_m: z.number().finite().positive(),
  layout_fingerprint: z.string().min(1),
  positioning_mode: z.enum(["world_calibrated", "distance_projected", "partial"]),
  geometry_kind: z.enum(["telemetry_derived_centreline", "telemetry_derived_partial"]),
  view_box: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  }),
  world_to_svg: circuitCalibrationTransformSchema,
  points: z.array(circuitCalibrationPointSchema).min(2).max(1000),
  segments: z.array(z.array(circuitCalibrationPointSchema).min(2).max(1000)).max(200).optional(),
  is_closed: z.boolean().optional(),
  start_finish: circuitCalibrationPointSchema,
  geometry_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  quality: circuitCalibrationQualitySchema,
  provenance: z.discriminatedUnion("source", [
    legacyCalibrationProvenanceSchema,
    progressiveCalibrationProvenanceSchema,
    builtInCalibrationProvenanceSchema
  ])
}).strict();

export const circuitSeedArtifactSchema = circuitCalibrationArtifactSchema.extend({
  seed_version: z.literal(1),
  positioning_mode: z.literal("world_calibrated"),
  geometry_kind: z.literal("telemetry_derived_centreline"),
  provenance: builtInCalibrationProvenanceSchema
}).strict();

export const circuitStaticMapArtifactSchema = z.object({
  schema_version: z.literal(1),
  asset_type: z.literal("packaged_static_centreline"),
  game_id: z.literal("f1_2021"),
  packet_format: z.literal(2021),
  game_track_id: z.number().int().min(0).max(127),
  track_id: z.string().min(1),
  track_name: z.string().min(1),
  expected_track_length_m: z.number().finite().positive(),
  track_length_tolerance_m: z.number().finite().positive().max(100),
  layout_fingerprint: z.string().min(1),
  layout_id: z.string().min(1),
  layout_version: z.string().min(1),
  direction: z.enum(["clockwise", "anticlockwise"]),
  path_direction: z.literal("racing_direction"),
  source_path_reversed: z.boolean(),
  progress_origin: z.literal("start_finish_at_source_path_origin"),
  start_finish_progress: z.literal(0),
  display_rotation_deg: z.number().finite(),
  validation_status: z.literal("verified_against_secondary_reference"),
  positioning_mode: z.literal("distance_projected"),
  geometry_kind: z.literal("packaged_static_centreline"),
  view_box: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  }).strict(),
  points: z.array(circuitCalibrationPointSchema).min(80).max(1000),
  is_closed: z.literal(true),
  start_finish: circuitCalibrationPointSchema,
  geometry_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.object({
    type: z.literal("licensed_versioned_svg"),
    project: z.string().min(1),
    author: z.string().min(1),
    license: z.string().min(1),
    attribution: z.string().min(1),
    repository_url: z.string().url(),
    asset_url: z.string().url(),
    layout_metadata_url: z.string().url(),
    source_commit: z.string().regex(/^[a-f0-9]{40}$/),
    source_svg_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    validation_references: z.array(z.string().url()).min(2),
    retrieved_at: z.string().min(1),
    transform: z.string().min(1),
    runtime_network_required: z.literal(false)
  }).strict()
}).strict();

export const circuitMapGeometrySchema = z.union([
  circuitCalibrationArtifactSchema,
  circuitStaticMapArtifactSchema
]);

export const circuitMapStateSchema = z.enum([
  "calibrating",
  "telemetry_derived",
  "world_calibrated",
  "distance_projected",
  "unavailable"
]);

export const circuitMapStatusSchema = z.object({
  state: circuitMapStateSchema,
  label: z.string().min(1),
  message: z.string().min(1),
  progress: z.number().min(0).max(1),
  layout_fingerprint: z.string().nullable(),
  calibration: circuitMapGeometrySchema.nullable(),
  map_source: z.enum(["local", "built_in", "static", "progressive", "none"]).optional(),
  positioning_source: z.enum(["local_world", "seed_world", "lap_distance", "none"]).optional(),
  refining: z.boolean().optional()
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
  packet_loss_available: z.literal(false),
  out_of_order_frames: z.number().int().nonnegative(),
  last_packet_at: z.string().datetime().nullable(),
  build_identity: z.object({
    component: z.literal("collector"),
    application_version: z.string().min(1),
    build_number: z.number().int().positive(),
    git_commit: z.string().min(1),
    process_id: z.number().int().positive(),
    process_start_time: z.string().datetime()
  })
});

export const collectorSessionEventSchema = z.object({
  collector_id: z.string().min(1), session_uid: z.string().min(1),
  event: z.enum(["session_ended", "session_changed", "collector_shutdown"]),
  interrupted: z.boolean(), raw_capture_path: z.string().nullable(),
  normalized_capture_path: z.string().nullable()
});

export const ingestBatchSchema = z.object({
  collector_id: z.string().min(1),
  samples: z.array(telemetrySampleSchema).min(1).max(1000)
});

export type TelemetrySample = z.infer<typeof telemetrySampleSchema>;
export type CircuitCalibrationArtifact = z.infer<typeof circuitCalibrationArtifactSchema>;
export type CircuitSeedArtifact = z.infer<typeof circuitSeedArtifactSchema>;
export type CircuitStaticMapArtifact = z.infer<typeof circuitStaticMapArtifactSchema>;
export type CircuitMapGeometry = z.infer<typeof circuitMapGeometrySchema>;
export type CircuitMapStatus = z.infer<typeof circuitMapStatusSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type CollectorHeartbeat = z.infer<typeof collectorHeartbeatSchema>;
export type CollectorSessionEvent = z.infer<typeof collectorSessionEventSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;
