import { z } from "zod";
import type { SessionDetail, SessionSummary } from "./types";

const scalarValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const numericRecord = z.record(z.string(), z.number().nullable());
const mixedRecord = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

const evidenceSchema = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  reference_value: z.number().nullable(),
  delta: z.number().nullable(),
  lap_numbers: z.array(z.number().int()),
  zone_id: z.string().nullable()
});

const findingSchema = z.object({
  id: z.string(),
  type: z.string(),
  priority: z.number().int(),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number(),
  title: z.string(),
  plain_language: z.string(),
  recommended_action: z.string(),
  evidence: z.array(evidenceSchema),
  limitations: z.array(z.string()),
  analysis_version: z.string()
});

const lapSchema = z.object({
  id: z.string(),
  lap_number: z.number().int(),
  lap_time_ms: z.number().int().nullable(),
  sector_times_ms: z.array(z.number().int()),
  valid: z.boolean(),
  classification: z.string(),
  quality_score: z.number(),
  tyre_wear_pct: z.number().nullable().optional(),
  coaching_available: z.boolean().nullable().optional(),
  status_label: z.string().nullable().optional()
});

const paceSchema = z.object({
  clean_laps: z.number().int(),
  best_lap_ms: z.number().int().nullable(),
  median_lap_ms: z.number().nullable(),
  mean_lap_ms: z.number().nullable(),
  std_dev_ms: z.number().nullable(),
  consistency_score: z.number(),
  theoretical_best_ms: z.number().int().nullable(),
  pace_degradation_ms_per_lap: z.number().nullable(),
  limitations: z.array(z.string())
});

const stintSchema = z.object({
  pace_degradation_ms_per_lap: z.number(),
  phase_consistency: z.record(z.string(), z.number()),
  tyre_wear_correlation: z.number().nullable(),
  increasing_error_frequency: z.boolean(),
  long_run_stability_score: z.number(),
  limitations: z.array(z.string())
});

export const sessionDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  session_uid: z.string(),
  game_id: z.string(),
  game_label: z.string(),
  track_id: z.string(),
  track_name: z.string(),
  track_length_m: z.number().positive().nullable(),
  car_id: z.string(),
  car_class: z.string(),
  session_type: z.string(),
  input_device: z.enum(["controller", "wheel", "unknown"]),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  analysis_status: z.string(),
  performance_mode: z.enum(["equal", "realistic", "unknown"]).nullable().optional(),
  performance_mode_source: z.enum(["user", "imported", "default", "unknown"]).nullable().optional(),
  context: z.record(z.string(), z.unknown()).nullable().optional(),
  interrupted: z.boolean().nullable().optional(),
  laps: z.array(lapSchema),
  metrics: z.object({
    pace: paceSchema.nullable(),
    stint: stintSchema.nullable(),
    braking: z.array(mixedRecord).nullable(),
    throttle: numericRecord.nullable(),
    steering: mixedRecord.nullable()
  }),
  findings: z.array(findingSchema),
  provenance: z.record(z.string(), scalarValue),
  report: z.record(z.string(), z.unknown()).nullable(),
  circuit_map: z.record(z.string(), z.unknown()).nullable().optional(),
  analysis_version: z.string().nullable().optional()
});

const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  game_id: z.string(),
  game_label: z.string(),
  track_id: z.string(),
  track_name: z.string(),
  car_id: z.string(),
  car_class: z.string(),
  session_type: z.string(),
  input_device: z.enum(["controller", "wheel", "unknown"]),
  started_at: z.string(),
  analysis_status: z.string(),
  lap_count: z.number().int().nonnegative(),
  clean_lap_count: z.number().int().nonnegative(),
  best_lap_ms: z.number().int().nullable(),
  consistency_score: z.number()
});

export function parseSessionDetail(value: unknown): SessionDetail | null {
  const parsed = sessionDetailSchema.safeParse(value);
  return parsed.success ? parsed.data as SessionDetail : null;
}

export function parseSessionSummaries(value: unknown): SessionSummary[] | null {
  const parsed = z.object({ items: z.array(sessionSummarySchema) }).safeParse(value);
  return parsed.success ? parsed.data.items as SessionSummary[] : null;
}
