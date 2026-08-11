export interface CalibrationTelemetrySample {
  timestamp_ms: number;
  frame_id: number;
  session_uid: string;
  game_id: string;
  packet_format?: number | undefined;
  game_track_id?: number | null | undefined;
  track_id?: string | null | undefined;
  track_name?: string | null | undefined;
  track_length_m?: number | null | undefined;
  lap_number: number;
  lap_distance_m?: number | null | undefined;
  position_x?: number | null | undefined;
  position_z?: number | null | undefined;
  yaw?: number | null | undefined;
  speed_kph?: number | null | undefined;
  lap_invalid?: boolean | undefined;
  pit_status?: number | null | undefined;
  driver_status?: number | null | undefined;
  surface_type?: number[] | null | undefined;
}

export interface CalibrationPoint {
  progress: number;
  x: number;
  y: number;
}

export interface CalibrationQuality {
  bin_count: number;
  covered_bins: number;
  coverage_ratio: number;
  sample_count: number;
  rejected_samples: number;
  source_session_count: number;
  maximum_gap_bins: number;
  closure_distance_svg: number;
  quality_score: number;
}

export interface CalibrationDraft {
  game_id: string;
  packet_format: number;
  game_track_id: number;
  track_id: string;
  track_name: string;
  track_length_m: number;
  layout_fingerprint: string;
  positioning_mode: "world_calibrated" | "partial";
  geometry_kind: "telemetry_derived_centreline" | "telemetry_derived_partial";
  view_box: { width: number; height: number };
  world_to_svg: {
    scale: number;
    offset_x: number;
    offset_y: number;
    invert_z: true;
  };
  points: CalibrationPoint[];
  segments: CalibrationPoint[][];
  is_closed: boolean;
  start_finish: CalibrationPoint;
  quality: CalibrationQuality;
}

export interface CalibrationOptions {
  binCount?: number;
  minimumCoverage?: number;
  maximumGapBins?: number;
  maximumWorldJumpM?: number;
  maximumCandidatesPerBin?: number;
  maximumCandidatesPerSessionPerBin?: number;
  flashbackQuarantineSamples?: number;
}

export interface CalibrationCandidate {
  x: number;
  z: number;
  weight: number;
  session_key: string;
  segment_id: number;
}

export interface ProgressiveCalibrationSnapshot {
  schema_version: 2;
  state: "learning";
  game_id: string;
  packet_format: number;
  game_track_id: number;
  track_id: string;
  track_name: string;
  track_length_m: number;
  layout_fingerprint: string;
  bin_count: number;
  bins: Array<{ index: number; candidates: CalibrationCandidate[] }>;
  accepted_samples: number;
  rejected_samples: number;
  rejection_reasons: Record<string, number>;
  source_sessions: string[];
}

export interface CalibrationIngestResult {
  accepted: boolean;
  reason: string;
  segment_id: number;
}

interface CalibrationIdentity {
  game_id: string;
  packet_format: number;
  game_track_id: number;
  track_id: string;
  track_name: string;
  track_length_m: number;
  layout_fingerprint: string;
}

interface TraceState {
  last: CalibrationTelemetrySample | null;
  segmentId: number;
  quarantineSamples: number;
}

interface WorldPoint {
  progress: number;
  x: number;
  z: number;
}

const DEFAULT_BIN_COUNT = 400;
export const DEFAULT_MINIMUM_COVERAGE = 0.9;
export const DEFAULT_MAXIMUM_GAP_BINS = 8;
const DEFAULT_MAXIMUM_CANDIDATES = 12;
const DEFAULT_MAXIMUM_SESSION_CANDIDATES = 4;

export function layoutFingerprint(sample: CalibrationTelemetrySample): string | null {
  const packetFormat = sample.packet_format;
  const trackId = sample.game_track_id;
  const length = sample.track_length_m;
  if (
    !sample.game_id
    || !Number.isInteger(packetFormat)
    || !Number.isInteger(trackId)
    || !isFinitePositive(length)
  ) return null;
  return `${sample.game_id}:${packetFormat}:${trackId}:${Math.round(length)}`;
}

export function calibrationFileStem(sample: CalibrationTelemetrySample): string | null {
  const fingerprint = layoutFingerprint(sample);
  if (!fingerprint) return null;
  return fingerprint.replaceAll(/[^a-zA-Z0-9_-]+/g, "-");
}

export function normalizeLapProgress(distanceM: unknown, trackLengthM: unknown): number | null {
  const distance = Number(distanceM);
  const length = Number(trackLengthM);
  if (!Number.isFinite(distance) || !isFinitePositive(length)) return null;
  const wrapped = ((distance % length) + length) % length;
  return wrapped / length;
}

export function markerHeadingDegrees(yawRadians: unknown): number | null {
  const yaw = Number(yawRadians);
  if (!Number.isFinite(yaw)) return null;
  return normalizeDegrees((yaw * 180) / Math.PI - 90);
}

export function transformWorldPoint(
  positionX: unknown,
  positionZ: unknown,
  transform: CalibrationDraft["world_to_svg"]
): { x: number; y: number } | null {
  const x = Number(positionX);
  const z = Number(positionZ);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return {
    x: x * transform.scale + transform.offset_x,
    y: transform.offset_y - z * transform.scale
  };
}

export class ProgressiveCalibrationAccumulator {
  readonly identity: CalibrationIdentity;
  private readonly options: Required<CalibrationOptions>;
  private readonly bins = new Map<number, CalibrationCandidate[]>();
  private readonly traces = new Map<string, TraceState>();
  private readonly sourceSessions = new Set<string>();
  private acceptedSamples = 0;
  private rejectedSamples = 0;
  private readonly rejectionReasons: Record<string, number> = {};

  constructor(
    sample: CalibrationTelemetrySample,
    options: CalibrationOptions = {},
    snapshot?: ProgressiveCalibrationSnapshot
  ) {
    const fingerprint = layoutFingerprint(sample);
    if (!fingerprint || sample.packet_format == null || sample.game_track_id == null) {
      throw new Error("A stable game, packet format, track ID, and track length are required");
    }
    this.options = normalizedOptions(options, snapshot?.bin_count);
    this.identity = {
      game_id: sample.game_id,
      packet_format: sample.packet_format,
      game_track_id: sample.game_track_id,
      track_id: sample.track_id ?? `track-${sample.game_track_id}`,
      track_name: sample.track_name ?? sample.track_id ?? `Track ${sample.game_track_id}`,
      track_length_m: Number(sample.track_length_m),
      layout_fingerprint: fingerprint
    };
    if (snapshot) this.restore(snapshot);
  }

  ingest(sample: CalibrationTelemetrySample): CalibrationIngestResult {
    const sessionKey = stableSessionKey(sample.session_uid);
    const trace = this.traces.get(sessionKey) ?? { last: null, segmentId: 0, quarantineSamples: 0 };
    this.traces.set(sessionKey, trace);
    if (layoutFingerprint(sample) !== this.identity.layout_fingerprint) {
      return this.reject("fingerprint_mismatch", trace);
    }
    const distance = Number(sample.lap_distance_m);
    const x = Number(sample.position_x);
    const z = Number(sample.position_z);
    if (!Number.isFinite(distance) || distance < 0 || distance > this.identity.track_length_m * 1.02) {
      return this.reject("invalid_lap_distance", trace);
    }
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(Number(sample.yaw))) {
      return this.reject("missing_world_position", trace);
    }
    if (Number(sample.pit_status ?? 0) > 0 || Number(sample.driver_status ?? 4) === 0) {
      this.startSegment(trace);
      return this.reject("pit_or_garage", trace);
    }
    const surfaceWeight = confidenceForSurface(sample.surface_type);
    if (surfaceWeight === 0) return this.reject("off_track_surface", trace);

    const previous = trace.last;
    if (previous) {
      const timeDelta = sample.timestamp_ms - previous.timestamp_ms;
      const distanceDelta = distance - Number(previous.lap_distance_m);
      const normalLapRollover = sample.lap_number > previous.lap_number
        && distance < this.identity.track_length_m * 0.08;
      const flashback = sample.frame_id + 2 < previous.frame_id
        || timeDelta < -100
        || (!normalLapRollover
          && sample.lap_number === previous.lap_number
          && distanceDelta < -Math.max(100, this.identity.track_length_m * 0.015));
      if (flashback) {
        this.startSegment(trace, this.options.flashbackQuarantineSamples);
        trace.last = sample;
        return this.reject("flashback_quarantine", trace);
      }
      if (sample.lap_number < previous.lap_number || normalLapRollover) this.startSegment(trace);
      if (!normalLapRollover && timeDelta > 0) {
        const worldJump = Math.hypot(x - Number(previous.position_x), z - Number(previous.position_z));
        const speedMps = Math.max(Number(sample.speed_kph ?? 0), Number(previous.speed_kph ?? 0)) / 3.6;
        const allowedJump = Math.max(
          this.options.maximumWorldJumpM,
          speedMps * (timeDelta / 1000) * 3 + 20,
          Math.abs(distanceDelta) * 2 + 20
        );
        if (worldJump > allowedJump) {
          this.startSegment(trace, Math.min(5, this.options.flashbackQuarantineSamples));
          trace.last = sample;
          return this.reject("teleport_or_impossible_jump", trace);
        }
        if (Math.abs(distanceDelta) < 0.02 && Math.max(Number(sample.speed_kph ?? 0), 0) < 1) {
          trace.last = sample;
          return { accepted: false, reason: "stationary", segment_id: trace.segmentId };
        }
      }
    }

    if (trace.quarantineSamples > 0) {
      trace.quarantineSamples -= 1;
      trace.last = sample;
      return this.reject("flashback_quarantine", trace);
    }

    const index = distanceBin(distance, this.identity.track_length_m, this.options.binCount);
    const existing = this.bins.get(index) ?? [];
    if (isRobustOutlier(existing, x, z)) {
      trace.last = sample;
      return this.reject("off_track_outlier", trace);
    }
    const candidate: CalibrationCandidate = {
      x: round(x, 4),
      z: round(z, 4),
      weight: surfaceWeight,
      session_key: sessionKey,
      segment_id: trace.segmentId
    };
    this.bins.set(index, retainBoundedCandidates(
      [...existing, candidate],
      this.options.maximumCandidatesPerBin,
      this.options.maximumCandidatesPerSessionPerBin
    ));
    this.sourceSessions.add(sessionKey);
    this.acceptedSamples += 1;
    trace.last = sample;
    return { accepted: true, reason: sample.lap_invalid ? "invalid_lap_geometry" : "geometry", segment_id: trace.segmentId };
  }

  coverage(): number {
    return this.bins.size / this.options.binCount;
  }

  usable(): boolean {
    return this.coverage() >= this.options.minimumCoverage
      && this.maximumGapBins() <= this.options.maximumGapBins;
  }

  maximumGapBins(): number {
    return maximumCircularGap(this.options.binCount, new Set(this.bins.keys()));
  }

  buildUsableDraft(): CalibrationDraft | null {
    if (!this.usable()) return null;
    const aggregated = this.aggregatedBins();
    const filled = interpolateSmallGaps(aggregated, this.options.maximumGapBins);
    if (!filled || filled.some((point) => point == null)) return null;
    const world = smoothClosedLoop(filled as WorldPoint[]);
    return this.buildDraft([world], true);
  }

  buildPartialDraft(): CalibrationDraft | null {
    const aggregated = this.aggregatedBins();
    const segments = contiguousSegments(aggregated).filter((segment) => segment.length >= 2);
    if (segments.length === 0) return null;
    return this.buildDraft(segments, false);
  }

  snapshot(): ProgressiveCalibrationSnapshot {
    return {
      schema_version: 2,
      state: "learning",
      ...this.identity,
      bin_count: this.options.binCount,
      bins: [...this.bins.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, candidates]) => ({ index, candidates })),
      accepted_samples: this.acceptedSamples,
      rejected_samples: this.rejectedSamples,
      rejection_reasons: { ...this.rejectionReasons },
      source_sessions: [...this.sourceSessions].sort()
    };
  }

  private restore(snapshot: ProgressiveCalibrationSnapshot): void {
    if (
      snapshot.schema_version !== 2
      || snapshot.layout_fingerprint !== this.identity.layout_fingerprint
      || snapshot.bin_count !== this.options.binCount
    ) return;
    for (const bin of snapshot.bins) {
      if (!Number.isInteger(bin.index) || bin.index < 0 || bin.index >= this.options.binCount) continue;
      const candidates = bin.candidates.filter(validCandidate);
      if (candidates.length) {
        this.bins.set(bin.index, retainBoundedCandidates(
          candidates,
          this.options.maximumCandidatesPerBin,
          this.options.maximumCandidatesPerSessionPerBin
        ));
      }
    }
    this.acceptedSamples = Math.max(0, Number(snapshot.accepted_samples) || 0);
    this.rejectedSamples = Math.max(0, Number(snapshot.rejected_samples) || 0);
    Object.assign(this.rejectionReasons, snapshot.rejection_reasons ?? {});
    for (const session of snapshot.source_sessions ?? []) {
      if (/^[a-f0-9]{8}$/.test(session)) this.sourceSessions.add(session);
    }
  }

  private aggregatedBins(): Array<WorldPoint | null> {
    return Array.from({ length: this.options.binCount }, (_, index) => {
      const candidates = this.bins.get(index);
      if (!candidates?.length) return null;
      return {
        progress: index / this.options.binCount,
        x: weightedMedian(candidates.map((candidate) => ({ value: candidate.x, weight: candidate.weight }))),
        z: weightedMedian(candidates.map((candidate) => ({ value: candidate.z, weight: candidate.weight })))
      };
    });
  }

  private buildDraft(worldSegments: WorldPoint[][], closed: boolean): CalibrationDraft | null {
    const worldPoints = worldSegments.flat();
    const bounds = pointBounds(worldPoints);
    if (!bounds || bounds.width < 20 || bounds.height < 20) return null;
    const margin = 32;
    const scale = (1000 - margin * 2) / Math.max(bounds.width, bounds.height);
    const viewBox = {
      width: round(bounds.width * scale + margin * 2, 3),
      height: round(bounds.height * scale + margin * 2, 3)
    };
    const transform = {
      scale: round(scale, 9),
      offset_x: round(margin - bounds.minimumX * scale, 9),
      offset_y: round(margin + bounds.maximumZ * scale, 9),
      invert_z: true as const
    };
    const segments = worldSegments.map((segment) => segment.map((point) => ({
      progress: round(point.progress, 6),
      x: round(point.x * transform.scale + transform.offset_x, 3),
      y: round(transform.offset_y - point.z * transform.scale, 3)
    })));
    const points = segments.flat();
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last) return null;
    const closureDistance = Math.hypot(first.x - last.x, first.y - last.y);
    const sampleCount = [...this.bins.values()].reduce((total, candidates) => total + candidates.length, 0);
    const qualityBase = {
      bin_count: this.options.binCount,
      covered_bins: this.bins.size,
      coverage_ratio: round(this.coverage(), 6),
      sample_count: Math.max(1, sampleCount),
      rejected_samples: this.rejectedSamples,
      source_session_count: Math.max(1, this.sourceSessions.size),
      maximum_gap_bins: this.maximumGapBins(),
      closure_distance_svg: round(closureDistance, 3)
    };
    const quality = { ...qualityBase, quality_score: calibrationQualityScore(qualityBase) };
    return {
      ...this.identity,
      positioning_mode: closed ? "world_calibrated" : "partial",
      geometry_kind: closed ? "telemetry_derived_centreline" : "telemetry_derived_partial",
      view_box: viewBox,
      world_to_svg: transform,
      points,
      segments,
      is_closed: closed,
      start_finish: points.find((point) => point.progress === 0) ?? first,
      quality
    };
  }

  private reject(reason: string, trace: TraceState): CalibrationIngestResult {
    this.rejectedSamples += 1;
    this.rejectionReasons[reason] = (this.rejectionReasons[reason] ?? 0) + 1;
    return { accepted: false, reason, segment_id: trace.segmentId };
  }

  private startSegment(trace: TraceState, quarantineSamples = 0): void {
    trace.segmentId += 1;
    trace.last = null;
    trace.quarantineSamples = Math.max(trace.quarantineSamples, quarantineSamples);
  }
}

export function deriveTelemetryCalibration(
  samples: readonly CalibrationTelemetrySample[],
  options: CalibrationOptions = {}
): CalibrationDraft | null {
  const first = samples.find((sample) => layoutFingerprint(sample) != null);
  if (!first) return null;
  const accumulator = new ProgressiveCalibrationAccumulator(first, options);
  for (const sample of samples) accumulator.ingest(sample);
  return accumulator.buildUsableDraft();
}

export function calibrationProgress(
  samples: readonly CalibrationTelemetrySample[],
  binCount = DEFAULT_BIN_COUNT
): number {
  const first = samples.find((sample) => layoutFingerprint(sample) != null);
  if (!first) return 0;
  const accumulator = new ProgressiveCalibrationAccumulator(first, { binCount });
  for (const sample of samples) accumulator.ingest(sample);
  return round(accumulator.coverage(), 4);
}

export function calibrationQualityScore(quality: {
  coverage_ratio?: number | undefined;
  sample_count?: number | undefined;
  rejected_samples?: number | undefined;
  source_session_count?: number | undefined;
  maximum_gap_bins?: number | undefined;
  closure_distance_svg?: number | undefined;
  quality_score?: number | undefined;
}): number {
  if (Number.isFinite(quality.quality_score)) return round(Number(quality.quality_score), 6);
  const samples = Math.max(1, Number(quality.sample_count) || 1);
  const rejected = Math.max(0, Number(quality.rejected_samples) || 0);
  const score = clamp(Number(quality.coverage_ratio) || 0, 0, 1) * 100
    + Math.min(samples, 5000) / 500
    + Math.min(Math.max(1, Number(quality.source_session_count) || 1), 10) * 0.5
    - (rejected / (samples + rejected)) * 10
    - Math.max(0, Number(quality.maximum_gap_bins) || 0) * 0.05
    - Math.max(0, Number(quality.closure_distance_svg) || 0) * 0.001;
  return round(Math.max(0, score), 6);
}

function normalizedOptions(options: CalibrationOptions, persistedBinCount?: number): Required<CalibrationOptions> {
  return {
    binCount: clampInteger(persistedBinCount ?? options.binCount ?? DEFAULT_BIN_COUNT, 80, 1000),
    minimumCoverage: clamp(options.minimumCoverage ?? DEFAULT_MINIMUM_COVERAGE, 0.8, 1),
    maximumGapBins: clampInteger(options.maximumGapBins ?? DEFAULT_MAXIMUM_GAP_BINS, 1, 40),
    maximumWorldJumpM: clamp(options.maximumWorldJumpM ?? 120, 20, 500),
    maximumCandidatesPerBin: clampInteger(options.maximumCandidatesPerBin ?? DEFAULT_MAXIMUM_CANDIDATES, 4, 32),
    maximumCandidatesPerSessionPerBin: clampInteger(
      options.maximumCandidatesPerSessionPerBin ?? DEFAULT_MAXIMUM_SESSION_CANDIDATES,
      1,
      12
    ),
    flashbackQuarantineSamples: clampInteger(options.flashbackQuarantineSamples ?? 30, 1, 120)
  };
}

function confidenceForSurface(surface: number[] | null | undefined): number {
  if (!surface?.length) return 0.65;
  if (surface.some((value) => [3, 4, 5, 6, 7, 8, 9].includes(value))) return 0;
  if (surface.some((value) => value === 1)) return 0.85;
  if (surface.every((value) => value === 0)) return 1;
  if (surface.every((value) => value === 0 || value === 1 || value === 2)) return 0.9;
  return 0.55;
}

function distanceBin(distance: number, length: number, binCount: number): number {
  return Math.min(binCount - 1, Math.max(0, Math.floor((distance / length) * binCount + 1e-7)));
}

function isRobustOutlier(candidates: CalibrationCandidate[], x: number, z: number): boolean {
  if (candidates.length < 4) return false;
  const centreX = weightedMedian(candidates.map((candidate) => ({ value: candidate.x, weight: candidate.weight })));
  const centreZ = weightedMedian(candidates.map((candidate) => ({ value: candidate.z, weight: candidate.weight })));
  const distances = candidates.map((candidate) => Math.hypot(candidate.x - centreX, candidate.z - centreZ));
  const spread = median(distances);
  return Math.hypot(x - centreX, z - centreZ) > Math.max(30, spread * 5 + 12);
}

function retainBoundedCandidates(
  candidates: CalibrationCandidate[],
  maximum: number,
  maximumPerSession: number
): CalibrationCandidate[] {
  const centreX = median(candidates.map((candidate) => candidate.x));
  const centreZ = median(candidates.map((candidate) => candidate.z));
  const ranked = [...candidates].sort((left, right) =>
    right.weight - left.weight
    || Math.hypot(left.x - centreX, left.z - centreZ) - Math.hypot(right.x - centreX, right.z - centreZ)
    || left.session_key.localeCompare(right.session_key)
    || left.segment_id - right.segment_id
    || left.x - right.x
    || left.z - right.z
  );
  const retained: CalibrationCandidate[] = [];
  const perSession = new Map<string, number>();
  for (const candidate of ranked) {
    if ((perSession.get(candidate.session_key) ?? 0) >= maximumPerSession) continue;
    retained.push(candidate);
    perSession.set(candidate.session_key, (perSession.get(candidate.session_key) ?? 0) + 1);
    if (retained.length >= maximum) break;
  }
  return retained;
}

function maximumCircularGap(binCount: number, populated: Set<number>): number {
  if (populated.size === 0) return binCount;
  if (populated.size === binCount) return 0;
  const indices = [...populated].sort((left, right) => left - right);
  let maximum = 0;
  for (let index = 0; index < indices.length; index += 1) {
    const current = indices[index]!;
    const next = indices[(index + 1) % indices.length]! + (index === indices.length - 1 ? binCount : 0);
    maximum = Math.max(maximum, next - current - 1);
  }
  return maximum;
}

function interpolateSmallGaps(
  points: Array<WorldPoint | null>,
  maximumGap: number
): Array<WorldPoint | null> | null {
  const output = [...points];
  for (let index = 0; index < output.length; index += 1) {
    if (output[index]) continue;
    const before = nearestPopulated(output, index, -1);
    const after = nearestPopulated(output, index, 1);
    if (!before || !after) return null;
    const gap = circularDistance(before.index, after.index, output.length, 1) - 1;
    if (gap > maximumGap) return null;
    const total = circularDistance(before.index, after.index, output.length, 1);
    const offset = circularDistance(before.index, index, output.length, 1);
    const ratio = total === 0 ? 0 : offset / total;
    output[index] = {
      progress: index / output.length,
      x: before.point.x + (after.point.x - before.point.x) * ratio,
      z: before.point.z + (after.point.z - before.point.z) * ratio
    };
  }
  return output;
}

function contiguousSegments(points: Array<WorldPoint | null>): WorldPoint[][] {
  const segments: WorldPoint[][] = [];
  let current: WorldPoint[] = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function smoothClosedLoop(points: readonly WorldPoint[]): WorldPoint[] {
  const weights = [1, 2, 4, 2, 1] as const;
  const divisor = weights.reduce((total, weight) => total + weight, 0);
  return points.map((point, index) => {
    let x = 0;
    let z = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const neighbour = points[(index + offset + points.length) % points.length]!;
      const weight = weights[offset + 2]!;
      x += neighbour.x * weight;
      z += neighbour.z * weight;
    }
    return { progress: point.progress, x: x / divisor, z: z / divisor };
  });
}

function pointBounds(points: readonly { x: number; z: number }[]) {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumZ = Math.min(...zs);
  const maximumZ = Math.max(...zs);
  return {
    minimumX,
    maximumX,
    minimumZ,
    maximumZ,
    width: maximumX - minimumX,
    height: maximumZ - minimumZ
  };
}

function nearestPopulated(
  points: readonly (WorldPoint | null)[],
  start: number,
  direction: -1 | 1
) {
  for (let offset = 1; offset < points.length; offset += 1) {
    const index = (start + offset * direction + points.length) % points.length;
    const point = points[index];
    if (point) return { index, point };
  }
  return null;
}

function circularDistance(start: number, end: number, length: number, direction: 1 | -1) {
  return direction === 1 ? (end - start + length) % length : (start - end + length) % length;
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  const sorted = [...values].sort((left, right) => left.value - right.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= total / 2) return item.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value == null) return 0;
  return sorted.length % 2 ? value : (value + (sorted[middle - 1] ?? value)) / 2;
}

function validCandidate(candidate: CalibrationCandidate): boolean {
  return Number.isFinite(candidate.x)
    && Number.isFinite(candidate.z)
    && Number.isFinite(candidate.weight)
    && candidate.weight > 0
    && candidate.weight <= 1
    && /^[a-f0-9]{8}$/.test(candidate.session_key)
    && Number.isInteger(candidate.segment_id)
    && candidate.segment_id >= 0;
}

function stableSessionKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.round(clamp(value, minimum, maximum));
}

function normalizeDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
