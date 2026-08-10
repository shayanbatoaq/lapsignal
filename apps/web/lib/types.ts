export interface Evidence {
  metric: string;
  value: number;
  unit: string;
  reference_value: number | null;
  delta: number | null;
  lap_numbers: number[];
  zone_id: string | null;
}

export interface Finding {
  id: string;
  type: string;
  priority: number;
  severity: "low" | "medium" | "high";
  confidence: number;
  title: string;
  plain_language: string;
  recommended_action: string;
  evidence: Evidence[];
  limitations: string[];
  analysis_version: string;
}

export interface Lap {
  id: string;
  lap_number: number;
  lap_time_ms: number;
  sector_times_ms: number[];
  valid: boolean;
  classification: string;
  quality_score: number;
  tyre_wear_pct: number | null;
}

export interface Session {
  id: string;
  title: string;
  session_uid: string;
  game_id: string;
  game_label: string;
  track_id: string;
  track_name: string;
  track_length_m: number;
  car_id: string;
  car_class: string;
  session_type: string;
  input_device: "controller" | "wheel" | "unknown";
  started_at: string;
  completed_at: string;
  demo_data: boolean;
  analysis_status: string;
  performance_mode?: "equal" | "realistic" | "unknown";
  performance_mode_source?: "user" | "imported" | "default" | "unknown";
  context?: Record<string, unknown>;
  interrupted?: boolean;
  laps: Lap[];
  metrics: {
    pace: {
      clean_laps: number;
      best_lap_ms: number;
      median_lap_ms: number;
      mean_lap_ms: number;
      std_dev_ms: number;
      consistency_score: number;
      theoretical_best_ms: number;
      pace_degradation_ms_per_lap: number | null;
      limitations: string[];
    };
    stint: {
      pace_degradation_ms_per_lap: number;
      phase_consistency: Record<string, number>;
      tyre_wear_correlation: number | null;
      increasing_error_frequency: boolean;
      long_run_stability_score: number;
      limitations: string[];
    };
    braking: Array<Record<string, number | string>>;
    throttle: Record<string, number | null>;
    steering: Record<string, number | string | null>;
  };
  findings: Finding[];
  provenance: Record<string, string | number>;
  report: CoachReport;
}

export interface CoachReport {
  id: string;
  session_id: string;
  mode: string;
  label: string;
  session_summary: string;
  top_priorities: Array<{ title: string; action: string; confidence: number; evidence_ids: string[] }>;
  what_improved: string;
  what_regressed: string;
  next_stint_plan: string;
  confidence_summary: string;
  limitations: string[];
  evidence_references: string[];
  provenance: Record<string, unknown>;
  summary?: string;
  positive?: string;
  priority_actions?: Array<{ priority: number; title: string; location: string; instruction: string; reason: string; evidence_ids: string[]; confidence: number; expected_gain_seconds: null }>;
  explanation?: string | null;
}

export interface TelemetryPoint {
  lap_distance_m: number;
  speed_kph: number;
  throttle_0_1: number;
  brake_0_1: number;
  steer_minus1_1: number;
  gear: number;
  rpm: number;
  current_lap_time_ms: number;
}

export interface TelemetryTrace {
  lap_number: number;
  lap_time_ms: number;
  valid: boolean;
  quality_score: number;
  samples: TelemetryPoint[];
}
