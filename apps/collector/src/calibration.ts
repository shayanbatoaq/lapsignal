import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  circuitCalibrationArtifactSchema,
  type CircuitCalibrationArtifact,
  type TelemetrySample
} from "@lapsignal/contracts";
import {
  calibrationFileStem,
  calibrationQualityScore,
  layoutFingerprint,
  ProgressiveCalibrationAccumulator,
  type CalibrationDraft,
  type CalibrationTelemetrySample,
  type ProgressiveCalibrationSnapshot
} from "@lapsignal/telemetry-domain/calibration";

interface CalibrationState {
  accumulator: ProgressiveCalibrationAccumulator;
  captureReference: string | null;
  lastProgressWriteMs: number;
  lastPersistedAccepted: number;
}

export interface CalibrationWriteResult {
  artifactPath: string;
  artifact: CircuitCalibrationArtifact;
  created: boolean;
}

export class CircuitCalibrationManager {
  private readonly calibrationDirectory: string;
  private readonly states = new Map<string, CalibrationState>();
  private readonly results = new Map<string, CalibrationWriteResult>();

  constructor(dataDirectory: string) {
    this.calibrationDirectory = join(dataDirectory, "local", "circuit-calibrations");
    mkdirSync(this.calibrationDirectory, { recursive: true });
  }

  ingest(sample: TelemetrySample, capturePath: string | null = null, updateProgress = true): void {
    const calibrationSample = toCalibrationSample(sample);
    const fingerprint = layoutFingerprint(calibrationSample);
    const stem = calibrationFileStem(calibrationSample);
    if (!fingerprint || !stem) return;
    let state = this.states.get(fingerprint);
    if (!state) {
      const progressPath = join(this.calibrationDirectory, `${stem}.progress.json`);
      const snapshot = readProgressSnapshot(progressPath, fingerprint);
      state = {
        accumulator: new ProgressiveCalibrationAccumulator(calibrationSample, {}, snapshot ?? undefined),
        captureReference: capturePath ? basename(capturePath) : null,
        lastProgressWriteMs: 0,
        lastPersistedAccepted: snapshot?.accepted_samples ?? 0
      };
      this.states.set(fingerprint, state);
    }
    if (!state.captureReference && capturePath) state.captureReference = basename(capturePath);
    const result = state.accumulator.ingest(calibrationSample);
    if (!updateProgress) return;
    const accepted = state.accumulator.snapshot().accepted_samples;
    if (result.accepted && accepted - state.lastPersistedAccepted >= 100) this.evaluate(stem, state);
  }

  finalize(): void {
    for (const state of this.states.values()) {
      const stem = state.accumulator.identity.layout_fingerprint.replaceAll(/[^a-zA-Z0-9_-]+/g, "-");
      this.evaluate(stem, state, true);
    }
  }

  generatedArtifacts(): CalibrationWriteResult[] {
    return [...this.results.values()];
  }

  private evaluate(stem: string, state: CalibrationState, force = false): void {
    const now = Date.now();
    const snapshot = state.accumulator.snapshot();
    if (
      !force
      && snapshot.accepted_samples - state.lastPersistedAccepted < 100
      && now - state.lastProgressWriteMs < 2000
    ) return;
    const partialDraft = state.accumulator.buildPartialDraft();
    const usableDraft = state.accumulator.buildUsableDraft();
    const partialArtifact = partialDraft ? createArtifact(stem, partialDraft, state.captureReference) : null;
    atomicJsonWrite(join(this.calibrationDirectory, `${stem}.progress.json`), {
      ...snapshot,
      progress: Number(state.accumulator.coverage().toFixed(6)),
      maximum_gap_bins: state.accumulator.maximumGapBins(),
      quality_status: usableDraft ? "usable" : partialDraft ? "learning" : "insufficient",
      partial_calibration: partialArtifact,
      updated_at: new Date(now).toISOString()
    });
    state.lastProgressWriteMs = now;
    state.lastPersistedAccepted = snapshot.accepted_samples;
    if (!usableDraft) return;

    const artifactPath = join(this.calibrationDirectory, `${stem}.json`);
    const artifact = createArtifact(stem, usableDraft, state.captureReference);
    const existing = readArtifact(artifactPath);
    if (existing && artifactQualityScore(existing) >= artifactQualityScore(artifact)) {
      this.results.set(stem, { artifactPath, artifact: existing, created: false });
      return;
    }
    atomicJsonWrite(artifactPath, artifact);
    this.results.set(stem, { artifactPath, artifact, created: true });
  }
}

function artifactQualityScore(artifact: CircuitCalibrationArtifact): number {
  const first = artifact.points[0];
  const last = artifact.points.at(-1);
  const closure = first && last ? Math.hypot(first.x - last.x, first.y - last.y) : 0;
  return calibrationQualityScore({
    ...artifact.quality,
    maximum_gap_bins: artifact.quality.maximum_gap_bins
      ?? Math.max(0, artifact.quality.bin_count - artifact.quality.covered_bins),
    closure_distance_svg: artifact.quality.closure_distance_svg ?? closure
  });
}

function createArtifact(
  stem: string,
  draft: CalibrationDraft,
  captureReference: string | null
): CircuitCalibrationArtifact {
  return circuitCalibrationArtifactSchema.parse({
    schema_version: 1,
    calibration_id: `calibration-${stem}`,
    game_id: draft.game_id,
    packet_format: draft.packet_format,
    game_track_id: draft.game_track_id,
    track_id: draft.track_id,
    track_name: draft.track_name,
    track_length_m: draft.track_length_m,
    layout_fingerprint: draft.layout_fingerprint,
    positioning_mode: draft.positioning_mode,
    geometry_kind: draft.geometry_kind,
    view_box: draft.view_box,
    world_to_svg: draft.world_to_svg,
    points: draft.points,
    segments: draft.segments,
    is_closed: draft.is_closed,
    start_finish: draft.start_finish,
    geometry_checksum: createHash("sha256").update(JSON.stringify(draft.points)).digest("hex"),
    quality: draft.quality,
    provenance: {
      source: "local_progressive_f1_2021_motion_packets",
      description: "Progressively learned telemetry-derived driven centreline. Reliable geometry from valid, invalid, and incomplete attempts is aggregated independently of official lap validity.",
      capture_reference: captureReference,
      generated_at: new Date().toISOString(),
      calibration_method: "bounded_distance_bin_weighted_median"
    }
  });
}

function toCalibrationSample(sample: TelemetrySample): CalibrationTelemetrySample {
  return {
    timestamp_ms: sample.timestamp_ms,
    frame_id: sample.frame_id,
    session_uid: sample.session_uid,
    game_id: sample.game_id,
    packet_format: sample.packet_format,
    game_track_id: sample.game_track_id,
    track_id: sample.track_id,
    track_name: sample.track_name,
    track_length_m: sample.track_length_m,
    lap_number: sample.lap_number,
    lap_distance_m: sample.lap_distance_m,
    position_x: sample.position_x,
    position_z: sample.position_z,
    yaw: sample.yaw,
    speed_kph: sample.speed_kph,
    lap_invalid: sample.lap_invalid,
    pit_status: sample.pit_status,
    driver_status: sample.driver_status,
    surface_type: sample.surface_type
  };
}

function atomicJsonWrite(path: string, value: unknown): void {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function readArtifact(path: string): CircuitCalibrationArtifact | null {
  try {
    const parsed = circuitCalibrationArtifactSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) return null;
    const checksum = createHash("sha256").update(JSON.stringify(parsed.data.points)).digest("hex");
    return checksum === parsed.data.geometry_checksum ? parsed.data : null;
  } catch {
    return null;
  }
}

function readProgressSnapshot(path: string, fingerprint: string): ProgressiveCalibrationSnapshot | null {
  if (!existsSync(path)) return null;
  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as ProgressiveCalibrationSnapshot;
    if (payload.schema_version !== 2 || payload.layout_fingerprint !== fingerprint) return null;
    return payload;
  } catch {
    return null;
  }
}
