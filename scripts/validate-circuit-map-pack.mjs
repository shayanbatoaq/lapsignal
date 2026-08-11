import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = path.join(root, "data", "circuit-maps");
const manifest = readJson(path.join(packRoot, "manifest.json"));
const requiredIds = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 26, 27, 28, 29];
const excludedIds = [8, 21, 22, 23, 24, 25];

assert(manifest.schema_version === 1, "manifest schema_version must be 1");
assert(manifest.pack_id === "lapsignal-f1-2021-full-circuits", "unexpected pack_id");
assert(manifest.game_id === "f1_2021" && manifest.packet_format === 2021, "wrong game contract");
assert(manifest.expected_track_count === 24 && manifest.entries?.length === 24, "pack must contain exactly 24 entries");
assert(same(manifest.supported_track_ids, requiredIds), "supported track IDs do not match the F1 2021 full-circuit contract");
assert(same(manifest.entries.map((entry) => entry.game_track_id), requiredIds), "entry ordering or IDs are invalid");
assert(same(manifest.excluded.map((entry) => entry.game_track_id), excludedIds), "excluded track IDs are invalid");
assert(new Set(manifest.entries.map((entry) => entry.game_track_id)).size === 24, "duplicate track ID");

let staticCount = 0;
let seedCount = 0;
const geometryChecksums = new Set();
for (const entry of manifest.entries) {
  assert(Number.isInteger(entry.game_track_id), `track ${entry.game_track_id}: invalid ID`);
  assert(typeof entry.track_id === "string" && entry.track_id.length > 0, `track ${entry.game_track_id}: missing slug`);
  assert(Number.isFinite(entry.expected_track_length_m) && entry.expected_track_length_m > 3000, `track ${entry.game_track_id}: invalid length`);
  assert(Number.isFinite(entry.track_length_tolerance_m) && entry.track_length_tolerance_m <= 100, `track ${entry.game_track_id}: unsafe length tolerance`);
  assert(entry.layout_fingerprint === `f1_2021:2021:${entry.game_track_id}:${entry.expected_track_length_m}`, `track ${entry.game_track_id}: layout fingerprint mismatch`);
  assert(entry.path_direction === "racing_direction" && entry.start_finish_progress === 0, `track ${entry.game_track_id}: progress direction contract missing`);
  assert(Number.isFinite(entry.display_rotation_deg), `track ${entry.game_track_id}: display rotation missing`);
  assert(entry.source?.runtime_network_required === false, `track ${entry.game_track_id}: runtime network dependency`);
  const assetPath = entry.representation === "telemetry_seed"
    ? resolveInside(path.join(root, "data", "circuit-seeds"), path.basename(entry.asset_path))
    : resolveInside(packRoot, entry.asset_path);
  const asset = readJson(assetPath);
  if (entry.representation === "telemetry_seed") {
    seedCount += 1;
    assert(asset.seed_version === 1 && asset.geometry_kind === "telemetry_derived_centreline", `track ${entry.game_track_id}: invalid telemetry seed`);
    assert(asset.game_track_id === entry.game_track_id && Math.round(asset.track_length_m) === entry.expected_track_length_m, `track ${entry.game_track_id}: seed identity mismatch`);
    validatePoints(asset, entry);
  } else {
    staticCount += 1;
    assert(entry.representation === "packaged_static", `track ${entry.game_track_id}: invalid representation`);
    assert(asset.asset_type === "packaged_static_centreline" && asset.geometry_kind === "packaged_static_centreline", `track ${entry.game_track_id}: invalid static asset`);
    assert(asset.game_track_id === entry.game_track_id && asset.expected_track_length_m === entry.expected_track_length_m, `track ${entry.game_track_id}: static identity mismatch`);
    assert(["clockwise", "anticlockwise"].includes(asset.direction), `track ${entry.game_track_id}: direction missing`);
    assert(asset.progress_origin === "start_finish_at_source_path_origin", `track ${entry.game_track_id}: start/finish origin missing`);
    assert(asset.source?.license === "CC-BY-4.0" && /^[a-f0-9]{40}$/.test(asset.source.source_commit), `track ${entry.game_track_id}: source attribution incomplete`);
    assert(typeof asset.source.attribution === "string" && asset.source.attribution.length > 20, `track ${entry.game_track_id}: attribution text missing`);
    assert(Array.isArray(asset.source.validation_references) && asset.source.validation_references.length >= 2, `track ${entry.game_track_id}: two-reference validation missing`);
    assert(/^[a-f0-9]{64}$/.test(asset.source.source_svg_sha256), `track ${entry.game_track_id}: source checksum missing`);
    assert(asset.validation_status === "verified_against_secondary_reference", `track ${entry.game_track_id}: validation status missing`);
    validatePoints(asset, entry);
  }
  assert(!geometryChecksums.has(entry.geometry_checksum), `track ${entry.game_track_id}: duplicate geometry checksum`);
  geometryChecksums.add(entry.geometry_checksum);
}
assert(staticCount === 16 && seedCount === 8, `expected 16 static and 8 telemetry entries, got ${staticCount}/${seedCount}`);
console.log(`Validated ${manifest.entries.length} F1 2021 maps: ${seedCount} telemetry seeds and ${staticCount} packaged static circuits; ${excludedIds.length} IDs remain explicitly unavailable.`);

function validatePoints(asset, entry) {
  assert(Array.isArray(asset.points) && asset.points.length >= 80 && asset.points.length <= 1000, `track ${entry.game_track_id}: invalid point count`);
  assert(asset.is_closed === true, `track ${entry.game_track_id}: geometry must be closed`);
  assert(new Set(asset.points.map((point) => `${point.x},${point.y}`)).size >= 75, `track ${entry.game_track_id}: placeholder or repeated geometry`);
  for (let index = 0; index < asset.points.length; index += 1) {
    const point = asset.points[index];
    assert(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.progress), `track ${entry.game_track_id}: non-finite point`);
    assert(point.progress >= 0 && point.progress < 1, `track ${entry.game_track_id}: progress out of range`);
    if (index > 0) assert(point.progress > asset.points[index - 1].progress, `track ${entry.game_track_id}: unordered progress`);
  }
  const checksum = crypto.createHash("sha256").update(JSON.stringify(asset.points)).digest("hex");
  assert(checksum === asset.geometry_checksum && checksum === entry.geometry_checksum, `track ${entry.game_track_id}: geometry checksum mismatch`);
  assert(asset.start_finish.x === asset.points[0].x && asset.start_finish.y === asset.points[0].y, `track ${entry.game_track_id}: start/finish must be point zero`);
  const arcLength = asset.points.reduce((total, point, index) => {
    const next = asset.points[(index + 1) % asset.points.length];
    return total + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
  assert(arcLength > 900, `track ${entry.game_track_id}: path arc length is not usable for distance projection`);
  if (asset.geometry_kind === "packaged_static_centreline") {
    const signedArea = asset.points.reduce((total, point, index) => {
      const next = asset.points[(index + 1) % asset.points.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0) / 2;
    assert(Math.abs(signedArea) > 500, `track ${entry.game_track_id}: degenerate direction area`);
    assert((asset.direction === "clockwise" && signedArea > 0) || (asset.direction === "anticlockwise" && signedArea < 0), `track ${entry.game_track_id}: path traversal disagrees with declared direction`);
  }
}

function resolveInside(parent, relative) {
  const resolved = path.resolve(parent, relative);
  const prefix = `${path.resolve(parent)}${path.sep}`.toLowerCase();
  assert(resolved.toLowerCase().startsWith(prefix), `asset escapes map pack: ${relative}`);
  return resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
