import "server-only";
import { sessionDetailSchema } from "./session-contract";
import type { CoachReport, Finding, Lap, Session, SessionSummary, TelemetryPoint, TelemetryTrace } from "./types";
import { showcaseCircuitMap as circuitMap } from "./showcase-map";

const TRACK_LENGTH_M = 7003;
const ANALYSIS_VERSION = "0.1.0-showcase";

type SessionSeed = {
  key: "baseline" | "practice-02" | "practice-03"; title: string; startedAt: string;
  lapTimes: Array<number | null>; invalid: number[]; consistency: number; theoreticalBest: number;
  degradation: number; phases: { opening: number; middle: number; closing: number };
  stability: number; brakeShift: number; throttleDelay: number;
};

const seeds: SessionSeed[] = [
  { key: "baseline", title: "Baseline · Spa", startedAt: "2026-06-06T14:00:00Z", lapTimes: [117420, 116880, 116240, null, 115960, 116510, 116090, 116740], invalid: [4], consistency: 82, theoreticalBest: 115510, degradation: 118, phases: { opening: 78, middle: 84, closing: 80 }, stability: 79, brakeShift: 0.018, throttleDelay: 0.065 },
  { key: "practice-02", title: "Practice 02 · Spa", startedAt: "2026-06-13T14:00:00Z", lapTimes: [115680, 115210, null, 114760, 114940, 114520, 114810, 114690], invalid: [3], consistency: 89, theoreticalBest: 114180, degradation: 54, phases: { opening: 85, middle: 91, closing: 88 }, stability: 87, brakeShift: 0.009, throttleDelay: 0.035 },
  { key: "practice-03", title: "Practice 03 · Spa", startedAt: "2026-06-20T14:00:00Z", lapTimes: [114120, 113780, 113340, null, 112980, 113160, 112840, 113020], invalid: [4], consistency: 94, theoreticalBest: 112530, degradation: 16, phases: { opening: 91, middle: 95, closing: 94 }, stability: 93, brakeShift: 0, throttleDelay: 0.012 }
];

function sectors(total: number): number[] {
  const first = Math.round(total * 0.286); const second = Math.round(total * 0.442);
  return [first, second, total - first - second];
}

function lapsFor(seed: SessionSeed): Lap[] {
  return seed.lapTimes.map((time, index) => {
    const lapNumber = index + 1; const valid = time !== null && !seed.invalid.includes(lapNumber);
    return { id: `showcase:${seed.key}:lap:${lapNumber}`, lap_number: lapNumber, lap_time_ms: time,
      sector_times_ms: time === null ? [] : sectors(time), valid, classification: valid ? "clean" : "invalid",
      quality_score: valid ? 0.97 : 0.76, tyre_wear_pct: 4.5 + index * 1.7, coaching_available: true,
      status_label: valid ? "Clean lap" : "Invalid lap · coaching available" };
  });
}

function findingsFor(seed: SessionSeed, cleanLaps: Lap[]): Finding[] {
  const lapNumbers = cleanLaps.slice(-3).map((lap) => lap.lap_number);
  return [
    { id: `showcase:${seed.key}:finding:braking`, type: "braking_release", priority: 1,
      severity: seed.key === "baseline" ? "high" : "medium", confidence: 0.91,
      title: "Stabilize the downhill brake release",
      plain_language: `Brake release varies most in the Les Combes approach; the representative trace shows ${(seed.brakeShift * TRACK_LENGTH_M).toFixed(1)} m of onset spread against the clean reference.`,
      recommended_action: "Use one repeatable initial pressure, then release progressively as steering builds.",
      evidence: [{ metric: "brake_onset_spread", value: Number((seed.brakeShift * TRACK_LENGTH_M).toFixed(1)), unit: "m", reference_value: 0, delta: Number((seed.brakeShift * TRACK_LENGTH_M).toFixed(1)), lap_numbers: lapNumbers, zone_id: "les-combes" }],
      limitations: ["Control-input observation; no claim about vehicle balance."], analysis_version: ANALYSIS_VERSION },
    { id: `showcase:${seed.key}:finding:throttle`, type: "throttle_pickup", priority: 2, severity: "medium", confidence: 0.88,
      title: "Commit earlier after the Bruxelles minimum",
      plain_language: `The representative clean laps show a ${(seed.throttleDelay * 1000).toFixed(0)} ms delay before sustained throttle compared with the session reference.`,
      recommended_action: "Hold the minimum speed, unwind steering, and make the first throttle application decisive.",
      evidence: [{ metric: "throttle_pickup_delay", value: Math.round(seed.throttleDelay * 1000), unit: "ms", reference_value: 0, delta: Math.round(seed.throttleDelay * 1000), lap_numbers: lapNumbers, zone_id: "bruxelles-exit" }],
      limitations: ["Representative comparison within this fictionalized session only."], analysis_version: ANALYSIS_VERSION },
    { id: `showcase:${seed.key}:finding:consistency`, type: "stint_consistency", priority: 3, severity: "low", confidence: 0.94,
      title: "Protect the closing-lap rhythm",
      plain_language: `Closing-phase consistency is ${seed.phases.closing}/100 versus ${seed.phases.middle}/100 through the middle phase.`,
      recommended_action: "Repeat the same braking references for two final laps before chasing additional pace.",
      evidence: [{ metric: "closing_phase_consistency", value: seed.phases.closing, unit: "score_0_100", reference_value: seed.phases.middle, delta: seed.phases.closing - seed.phases.middle, lap_numbers: lapNumbers, zone_id: null }],
      limitations: [], analysis_version: ANALYSIS_VERSION }
  ];
}

function traceFor(seed: SessionSeed, lap: Lap): TelemetryTrace {
  const count = 160; const lapTime = lap.lap_time_ms ?? 116000;
  const samples: TelemetryPoint[] = Array.from({ length: count }, (_, index) => {
    const p = index / (count - 1); const corners = Math.max(0, Math.sin(p * Math.PI * 14));
    const braking = Math.max(0, Math.sin((p + seed.brakeShift) * Math.PI * 14) - 0.62) / 0.38;
    const throttle = Math.max(0, Math.min(1, 1 - braking * 1.18 - corners * (0.3 + seed.throttleDelay)));
    const speed = 332 - corners * 142 - braking * 38 + Math.sin(p * Math.PI * 4) * 8;
    return { lap_distance_m: Math.round(p * TRACK_LENGTH_M), speed_kph: Math.round(Math.max(74, speed)),
      throttle_0_1: Number(throttle.toFixed(3)), brake_0_1: Number(Math.min(1, braking).toFixed(3)),
      steer_minus1_1: Number((Math.sin(p * Math.PI * 14) * 0.72).toFixed(3)), gear: Math.max(2, Math.min(8, Math.round(speed / 45))),
      rpm: Math.round(8200 + Math.max(0, speed - 100) * 22), current_lap_time_ms: Math.round(p * lapTime) };
  });
  return { lap_number: lap.lap_number, lap_time_ms: lap.lap_time_ms, valid: lap.valid, quality_score: lap.quality_score, samples };
}

function reportFor(seed: SessionSeed, findings: Finding[]): CoachReport {
  return { id: `showcase:${seed.key}:report`, session_id: `showcase:session:${seed.key}`, mode: "rule_based",
    label: "Representative deterministic coaching",
    session_summary: `${seed.title} shows a consistency score of ${seed.consistency}/100. The next stint should prioritize repeatable release and throttle shapes before adding risk.`,
    top_priorities: findings.map((finding) => ({ title: finding.title, action: finding.recommended_action, confidence: finding.confidence, evidence_ids: [finding.id] })),
    what_improved: seed.key === "baseline" ? "This session establishes the fictionalized baseline." : "Best clean pace and phase consistency improved against the preceding representative session.",
    what_regressed: "No supported regression is claimed beyond the listed session limitations.",
    next_stint_plan: "Run four measured laps with one braking reference and one throttle-release cue, then compare only clean attempts.",
    confidence_summary: "All displayed actions resolve to bundled representative evidence; no cloud model was contacted.",
    limitations: ["Fictionalized representative telemetry for interface evaluation."], evidence_references: findings.map((finding) => finding.id),
    provenance: { provider: "rule_based", source: "showcase_fixture", cached: true, generated_at: seed.startedAt } };
}

function sessionFor(seed: SessionSeed): Session {
  const laps = lapsFor(seed); const clean = laps.filter((lap) => lap.valid && lap.lap_time_ms !== null);
  const times = clean.map((lap) => lap.lap_time_ms as number); const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const stdDev = Math.sqrt(times.reduce((sum, value) => sum + (value - mean) ** 2, 0) / times.length);
  const findings = findingsFor(seed, clean);
  const session: Session = {
    id: `showcase:session:${seed.key}`, title: seed.title, session_uid: `showcase:uid:${seed.key}`,
    game_id: "f1_2021", game_label: "F1 2021 compatibility", track_id: "spa-francorchamps", track_name: "Spa-Francorchamps", track_length_m: TRACK_LENGTH_M,
    car_id: "showcase-open-wheel-01", car_class: "Modern open wheel", session_type: "Time Trial", input_device: "controller",
    started_at: seed.startedAt, completed_at: new Date(Date.parse(seed.startedAt) + 28 * 60_000).toISOString(), analysis_status: "analyzed",
    performance_mode: "equal", performance_mode_source: "imported", context: { team_name: "Apex Dynamics", weather: "Clear", programme: seed.title }, interrupted: false,
    laps, metrics: {
      pace: { clean_laps: clean.length, best_lap_ms: Math.min(...times), median_lap_ms: median, mean_lap_ms: Number(mean.toFixed(1)), std_dev_ms: Number(stdDev.toFixed(1)), consistency_score: seed.consistency, theoretical_best_ms: seed.theoreticalBest, pace_degradation_ms_per_lap: seed.degradation, limitations: [] },
      stint: { pace_degradation_ms_per_lap: seed.degradation, phase_consistency: seed.phases, tyre_wear_correlation: null, increasing_error_frequency: seed.key === "baseline", long_run_stability_score: seed.stability, limitations: ["Tyre-wear correlation unavailable in the representative dataset."] },
      braking: [{ zone: "les-combes", onset_spread_m: Number((seed.brakeShift * TRACK_LENGTH_M).toFixed(1)), release_smoothness: Number((0.78 + seed.consistency / 500).toFixed(2)) }],
      throttle: { pickup_delay_ms: Math.round(seed.throttleDelay * 1000), modulation: Number((0.19 - seed.consistency / 1000).toFixed(3)) },
      steering: { smoothness_score: seed.consistency, correction_count: seed.key === "baseline" ? 8 : seed.key === "practice-02" ? 5 : 3 }
    }, findings, provenance: { source: "showcase_fixture", telemetry_schema: 1, analysis_version: ANALYSIS_VERSION, build: 4, physical_capture: false },
    report: reportFor(seed, findings), circuit_map: circuitMap };
  return sessionDetailSchema.parse(session) as unknown as Session;
}

export const showcaseSessions = seeds.map(sessionFor);
export const showcaseFeaturedSessionId = "showcase:session:practice-03";
export const showcaseSummaries: SessionSummary[] = showcaseSessions.map((session) => ({
  id: session.id, title: session.title, game_id: session.game_id, game_label: session.game_label, track_id: session.track_id,
  track_name: session.track_name, car_id: session.car_id, car_class: session.car_class, session_type: session.session_type,
  input_device: session.input_device, started_at: session.started_at, analysis_status: session.analysis_status,
  lap_count: session.laps.length, clean_lap_count: session.metrics.pace.clean_laps, best_lap_ms: session.metrics.pace.best_lap_ms,
  consistency_score: session.metrics.pace.consistency_score }));
export const showcaseTelemetry = new Map(showcaseSessions.map((session, index) => [session.id, session.laps.map((lap) => traceFor(seeds[index]!, lap))]));
export function getShowcaseSession(id: string) { return showcaseSessions.find((session) => session.id === id) ?? null; }
export function getShowcaseTelemetry(id: string, lapNumbers: number[]) { return (showcaseTelemetry.get(id) ?? []).filter((trace) => lapNumbers.includes(trace.lap_number)); }
export const showcasePayloadBytes = new TextEncoder().encode(JSON.stringify({ showcaseSessions, traces: [...showcaseTelemetry.values()] })).byteLength;
