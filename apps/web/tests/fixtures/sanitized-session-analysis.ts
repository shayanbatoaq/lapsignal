import type { SessionDetail } from "@/lib/types";

export const sanitizedSessionAnalysis = {
  pace: {
    clean_laps: 0,
    best_lap_ms: null,
    median_lap_ms: null,
    mean_lap_ms: null,
    std_dev_ms: null,
    consistency_score: 0,
    theoretical_best_ms: null,
    pace_degradation_ms_per_lap: null,
    limitations: ["Clean timing evidence is unavailable."]
  },
  stint: null,
  braking: null,
  throttle: {},
  steering: null
} satisfies SessionDetail["metrics"];
