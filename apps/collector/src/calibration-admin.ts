import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  circuitCalibrationArtifactSchema,
  circuitSeedArtifactSchema,
  type CircuitCalibrationArtifact,
  type CircuitSeedArtifact
} from "@lapsignal/contracts";
import { calibrationQualityScore } from "@lapsignal/telemetry-domain/calibration";

const args = process.argv.slice(2);
const command = args[0] ?? "list";
const dataDirectory = resolve(flagValue("--data-dir") ?? resolve(import.meta.dirname, "../../..", "data"));
const localDirectory = join(dataDirectory, "local", "circuit-calibrations");
const seedDirectory = join(dataDirectory, "circuit-seeds");

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  if (command === "list") list();
  else if (command === "validate") validate();
  else if (command === "promote") promote();
  else fail(`Unknown calibration command: ${command}`);
}

function list(): void {
  const local = localArtifacts().map(({ file, artifact }) => summary("local", file, artifact));
  const seeds = seedArtifacts().map(({ file, artifact }) => summary("built_in", file, artifact));
  process.stdout.write(`${JSON.stringify({ local, seeds }, null, 2)}\n`);
}

function validate(): void {
  const results = [
    ...localFiles().map((file) => validateLocalFile(file)),
    ...seedFiles().map((file) => validateSeedFile(file))
  ];
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results.some((result) => !result.valid)) process.exitCode = 1;
}

function promote(): void {
  const requestedTrackId = Number(flagValue("--track-id"));
  if (!Number.isInteger(requestedTrackId) || requestedTrackId < 0) {
    fail("promote requires --track-id <numeric F1 track ID>");
  }
  const dryRun = args.includes("--dry-run");
  const candidates = localArtifacts()
    .filter(({ artifact }) => artifact.game_track_id === requestedTrackId)
    .filter(({ file, artifact }) => validateLocalArtifact(file, artifact).valid);
  if (candidates.length === 0) fail(`No promotable local calibration found for track ID ${requestedTrackId}`);
  const selected = selectBestByFingerprint(candidates);
  const promoted = selected.map(({ file, artifact }) => {
    const seed = createSeed(artifact);
    const privacy = auditSeedPrivacy(seed);
    if (!privacy.valid) fail(`Promotion privacy audit failed for ${file}: ${privacy.violations.join(", ")}`);
    const parsed = circuitSeedArtifactSchema.parse(seed);
    const output = join(seedDirectory, `${file.replace(/\.json$/, "")}.seed.json`);
    if (!dryRun) {
      mkdirSync(seedDirectory, { recursive: true });
      atomicJsonWrite(output, parsed);
    }
    return {
      track_id: parsed.game_track_id,
      fingerprint: parsed.layout_fingerprint,
      source_file: file,
      output_file: output.replace(`${dataDirectory}\\`, ""),
      dry_run: dryRun,
      checksum: parsed.geometry_checksum,
      coverage: parsed.quality.coverage_ratio,
      privacy: "normalized_non_personal"
    };
  });
  process.stdout.write(`${JSON.stringify(promoted, null, 2)}\n`);
}

function createSeed(artifact: CircuitCalibrationArtifact): CircuitSeedArtifact {
  const first = artifact.points[0]!;
  const last = artifact.points.at(-1)!;
  const closure = Math.hypot(first.x - last.x, first.y - last.y);
  const qualityBase = {
    bin_count: artifact.quality.bin_count,
    covered_bins: artifact.quality.covered_bins,
    coverage_ratio: artifact.quality.coverage_ratio,
    sample_count: artifact.quality.sample_count,
    rejected_samples: artifact.quality.rejected_samples,
    source_session_count: artifact.quality.source_session_count ?? 1,
    maximum_gap_bins: artifact.quality.maximum_gap_bins ?? (artifact.quality.coverage_ratio === 1 ? 0 : artifact.quality.bin_count),
    closure_distance_svg: artifact.quality.closure_distance_svg ?? Number(closure.toFixed(3))
  };
  return circuitSeedArtifactSchema.parse({
    seed_version: 1,
    schema_version: 1,
    calibration_id: `seed-${artifact.layout_fingerprint.replaceAll(/[^a-zA-Z0-9_-]+/g, "-")}`,
    game_id: artifact.game_id,
    packet_format: artifact.packet_format,
    game_track_id: artifact.game_track_id,
    track_id: artifact.track_id,
    track_name: artifact.track_name,
    track_length_m: artifact.track_length_m,
    layout_fingerprint: artifact.layout_fingerprint,
    positioning_mode: "world_calibrated",
    geometry_kind: "telemetry_derived_centreline",
    view_box: artifact.view_box,
    world_to_svg: artifact.world_to_svg,
    points: artifact.points,
    segments: [artifact.points],
    is_closed: true,
    start_finish: artifact.start_finish,
    geometry_checksum: artifact.geometry_checksum,
    quality: { ...qualityBase, quality_score: calibrationQualityScore(qualityBase) },
    provenance: {
      source: "built_in_telemetry_seed",
      description: "Approved telemetry-derived driven centreline for immediate local circuit rendering and positioning; not surveyed circuit boundaries or width.",
      calibration_method: "telemetry_derived_distance_bins",
      privacy: "normalized_non_personal"
    }
  });
}

function validateLocalFile(file: string) {
  try {
    const artifact = circuitCalibrationArtifactSchema.parse(readJson(join(localDirectory, file)));
    return validateLocalArtifact(file, artifact);
  } catch (error) {
    return { file, kind: "local", valid: false, violations: [safeError(error)] };
  }
}

function validateLocalArtifact(file: string, artifact: CircuitCalibrationArtifact) {
  const violations = geometryViolations(artifact);
  if (artifact.quality.coverage_ratio < 0.9) violations.push("coverage_below_0.90");
  if ((artifact.quality.maximum_gap_bins ?? 0) > 8) violations.push("maximum_gap_exceeds_8_bins");
  return { file, kind: "local", valid: violations.length === 0, violations };
}

function validateSeedFile(file: string) {
  try {
    const seed = circuitSeedArtifactSchema.parse(readJson(join(seedDirectory, file)));
    const privacy = auditSeedPrivacy(seed);
    const violations = [...geometryViolations(seed), ...privacy.violations];
    return { file, kind: "built_in", valid: violations.length === 0, violations };
  } catch (error) {
    return { file, kind: "built_in", valid: false, violations: [safeError(error)] };
  }
}

function geometryViolations(artifact: CircuitCalibrationArtifact): string[] {
  const violations: string[] = [];
  const expectedFingerprint = `${artifact.game_id}:${artifact.packet_format}:${artifact.game_track_id}:${Math.round(artifact.track_length_m)}`;
  if (artifact.layout_fingerprint !== expectedFingerprint) violations.push("layout_fingerprint_mismatch");
  const checksum = createHash("sha256").update(JSON.stringify(artifact.points)).digest("hex");
  if (checksum !== artifact.geometry_checksum) violations.push("geometry_checksum_mismatch");
  if (artifact.is_closed === false || artifact.geometry_kind !== "telemetry_derived_centreline") {
    violations.push("geometry_not_closed");
  }
  if (artifact.points.length < 80) violations.push("insufficient_geometry_points");
  const distances = artifact.points.slice(1).map((point, index) => {
    const previous = artifact.points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const medianStep = median(distances);
  const first = artifact.points[0]!;
  const last = artifact.points.at(-1)!;
  const closure = Math.hypot(first.x - last.x, first.y - last.y);
  if (closure > Math.max(30, medianStep * 4)) violations.push("start_finish_closure_unstable");
  return violations;
}

export function auditSeedPrivacy(seed: CircuitSeedArtifact): { valid: boolean; violations: string[] } {
  const forbiddenKeys = /session_(?:uid|id|hash)|timestamp|generated|updated|player|driver|car_(?:id|choice|number)|lap_time|capture|machine|host|file_path|raw_packet/i;
  const forbiddenValues = /\.lsraw|\.jsonl|[A-Z]:\\|\\Users\\|session-/i;
  const violations: string[] = [];
  const visit = (value: unknown, pointer: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${pointer}/${index}`));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (forbiddenKeys.test(key)) violations.push(`${pointer}/${key}:forbidden_key`);
        visit(item, `${pointer}/${key}`);
      }
    } else if (typeof value === "string" && forbiddenValues.test(value)) {
      violations.push(`${pointer}:forbidden_value`);
    }
  };
  visit(seed, "");
  return { valid: violations.length === 0, violations };
}

function selectBestByFingerprint<T extends { file: string; artifact: CircuitCalibrationArtifact }>(items: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.artifact.layout_fingerprint, [...(grouped.get(item.artifact.layout_fingerprint) ?? []), item]);
  return [...grouped.values()].map((group) => group.sort(compareArtifacts)[0]!);
}

function compareArtifacts(left: { file: string; artifact: CircuitCalibrationArtifact }, right: { file: string; artifact: CircuitCalibrationArtifact }): number {
  const leftRejected = left.artifact.quality.rejected_samples / Math.max(1, left.artifact.quality.sample_count + left.artifact.quality.rejected_samples);
  const rightRejected = right.artifact.quality.rejected_samples / Math.max(1, right.artifact.quality.sample_count + right.artifact.quality.rejected_samples);
  return right.artifact.quality.coverage_ratio - left.artifact.quality.coverage_ratio
    || right.artifact.quality.sample_count - left.artifact.quality.sample_count
    || leftRejected - rightRejected
    || (left.artifact.quality.closure_distance_svg ?? 0) - (right.artifact.quality.closure_distance_svg ?? 0)
    || left.artifact.geometry_checksum.localeCompare(right.artifact.geometry_checksum)
    || left.file.localeCompare(right.file);
}

function summary(source: "local" | "built_in", file: string, artifact: CircuitCalibrationArtifact) {
  return {
    source,
    file,
    game: artifact.game_id,
    packet_format: artifact.packet_format,
    track_id: artifact.game_track_id,
    track_name: artifact.track_name,
    track_length_m: artifact.track_length_m,
    layout_fingerprint: artifact.layout_fingerprint,
    coverage: artifact.quality.coverage_ratio,
    sample_count: artifact.quality.sample_count,
    rejected_samples: artifact.quality.rejected_samples,
    quality_score: calibrationQualityScore(artifact.quality),
    checksum: artifact.geometry_checksum
  };
}

function localArtifacts() {
  return localFiles().flatMap((file) => {
    try {
      return [{ file, artifact: circuitCalibrationArtifactSchema.parse(readJson(join(localDirectory, file))) }];
    } catch {
      return [];
    }
  });
}

function seedArtifacts() {
  return seedFiles().flatMap((file) => {
    try {
      return [{ file, artifact: circuitSeedArtifactSchema.parse(readJson(join(seedDirectory, file))) }];
    } catch {
      return [];
    }
  });
}

function localFiles(): string[] {
  try { return readdirSync(localDirectory).filter((file) => file.endsWith(".json") && !file.endsWith(".progress.json")).sort(); }
  catch { return []; }
}

function seedFiles(): string[] {
  try { return readdirSync(seedDirectory).filter((file) => file.endsWith(".seed.json")).sort(); }
  catch { return []; }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function atomicJsonWrite(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function flagValue(flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : "validation_error";
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
