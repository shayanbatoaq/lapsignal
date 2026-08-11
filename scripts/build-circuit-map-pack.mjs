import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { svgPathProperties } from "svg-path-properties";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = path.join(root, "data", "circuit-maps");
const sourceRoot = path.join(packRoot, "source", "f1db");
const mapRoot = path.join(packRoot, "maps");
const sourceCommit = "21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf";
const retrievedAt = "2026-08-11";
const pointCount = 240;
const secondaryReferences = {
  "melbourne-1": "https://commons.wikimedia.org/wiki/File:Circuit_Albert_Park.svg",
  "paul-ricard-3": "https://commons.wikimedia.org/wiki/File:Circuit_Paul_Ricard_2020_layout_map.svg",
  "montreal-6": geoJson("ca-1978"),
  "silverstone-8": geoJson("gb-1948"),
  "hungaroring-3": geoJson("hu-1986"),
  "spa-francorchamps-4": "https://commons.wikimedia.org/wiki/File:Spa-Francorchamps_of_Belgium.svg",
  "monza-7": "https://commons.wikimedia.org/wiki/File:Monza_track_map.svg",
  "marina-bay-3": "https://commons.wikimedia.org/wiki/File:Singapore_Street_Circuit_2015.svg",
  "suzuka-2": geoJson("jp-1962"),
  "yas-marina-1": "https://commons.wikimedia.org/wiki/File:Circuit_Yas-Island.svg",
  "interlagos-2": geoJson("br-1940"),
  "spielberg-3": "https://commons.wikimedia.org/wiki/File:Circuit_Red_Bull_Ring.svg",
  "sochi-1": geoJson("ru-2014"),
  "mexico-city-3": geoJson("mx-1962"),
  "zandvoort-5": geoJson("nl-1948"),
  "jeddah-1": geoJson("sa-2021")
};

const circuits = [
  seed(0, "melbourne", "Melbourne", 5303, "melbourne-1", "1996-2019 / F1 2021 game layout", "clockwise", "0d8f6c3315dae276a656e0549385a7bf9a597b598145c69c0b995ece636f3da6"),
  seed(1, "paul-ricard", "Paul Ricard", 5814, "paul-ricard-3", "2018-2019, 2021-2022", "clockwise", "8c6229b6738662bcdc0fd27d3b0878d0ec3c0d2d1d5e8337b9b0b9d6ee5fb234"),
  telemetry(2, "shanghai", "Shanghai", 5441, "Shanghai Grand Prix layout", "clockwise"),
  telemetry(3, "sakhir", "Sakhir", 5408, "Bahrain Grand Prix layout", "clockwise"),
  telemetry(4, "catalunya", "Catalunya", 4650, "F1 2021 game layout", "clockwise"),
  telemetry(5, "monaco", "Monaco", 3323, "2003-present Grand Prix layout", "clockwise"),
  seed(6, "montreal", "Montreal", 4371, "montreal-6", "2002-2008, 2010-2019 / F1 2021 game layout", "clockwise", "00482a06496986fba237267c49701e7a63bcfbde981cd755a1a3fd92ef4df938"),
  seed(7, "silverstone", "Silverstone", 5896, "silverstone-8", "2010-present Grand Prix layout", "clockwise", "fce1b32f8d50943d41bf15d248ae4184dc5f378dcfcf4dd7d6940357c7107e60"),
  seed(9, "hungaroring", "Hungaroring", 4381, "hungaroring-3", "2003-present", "clockwise", "e3397c965700d1ea3f1d3a851def06b5b86aea191e62f5f5c71fd3fed43bbe12"),
  seed(10, "spa-francorchamps", "Spa-Francorchamps", 7003, "spa-francorchamps-4", "2007-present Grand Prix layout", "clockwise", "65a367511e03254cc1e97e0eb1fe8abb42f2de4f9d8bb6638050a02b483f2261"),
  seed(11, "monza", "Monza", 5793, "monza-7", "2000-present Grand Prix layout", "clockwise", "1674c9b93882b0587a15bd0d470445273f4bc5f20e819064b35f2e9d1936b481"),
  seed(12, "singapore", "Singapore", 5063, "marina-bay-3", "2015-2019, 2022 / pre-2023 layout", "anticlockwise", "80414bfd02e2b2a7424fe4f3acc7105ea142bf75846fa1f2484e97dc35247b75"),
  seed(13, "suzuka", "Suzuka", 5807, "suzuka-2", "2003-2006, 2009-2019 / F1 2021 game layout", "clockwise", "112c931817ba8b2595e26bbd4cb699614ad928a63e7b68d395b9186f85638805"),
  seed(14, "abu-dhabi", "Abu Dhabi", 5547, "yas-marina-1", "2009-2020 / pre-redesign F1 2021 game layout", "anticlockwise", "9fd1e6e91f1a0dfe556893124c7e0b87d9cc8bf2b7990e1dbb3ca42abfcaa3ae", true),
  telemetry(15, "circuit-of-the-americas", "Circuit of the Americas", 5514, "Grand Prix layout", "anticlockwise"),
  seed(16, "interlagos", "Interlagos", 4309, "interlagos-2", "1990-present Grand Prix layout", "anticlockwise", "07c5e001052677d0b4610832d6097be84a9e71000df195c3f2ac3ab3a51c784c"),
  seed(17, "red-bull-ring", "Red Bull Ring", 4318, "spielberg-3", "1997-2003, 2014-2026 Grand Prix layout", "clockwise", "bf9158c7a975c9e5b1c238b7eab7ad158d5bcbb667b1a59863d798394d1a5ba9", true),
  seed(18, "sochi", "Sochi", 5848, "sochi-1", "2014-2021 Grand Prix layout", "clockwise", "af9ffd9961b0b90685a93246e71796c9e185b3062b6315411d68f3a0c8791105", true),
  seed(19, "mexico-city", "Mexico City", 4304, "mexico-city-3", "2015-2019, 2021-present Grand Prix layout", "clockwise", "7739650af3fb54d4f4527ef1eeeb669d027c7919e488a1a56d1a91ef4ac2e874"),
  telemetry(20, "baku", "Baku", 5994, "Baku City Circuit Grand Prix layout", "anticlockwise"),
  seed(26, "zandvoort", "Zandvoort", 4259, "zandvoort-5", "2021-present Grand Prix layout", "clockwise", "99b5d358b4d455a01ffbfa2eab6b36a7fa7c35e6b5437111d02dca3ba8d8747a"),
  telemetry(27, "imola", "Imola", 4910, "2020-2021 Grand Prix layout", "anticlockwise"),
  telemetry(28, "portimao", "Portimão", 4650, "Grand Prix layout", "clockwise"),
  seed(29, "jeddah", "Jeddah", 6176, "jeddah-1", "2021 inaugural Grand Prix layout", "anticlockwise", "d41ad6d0444aa74607f15a87c4b57b88b61990522a6b9af1ffb8b422c0755e74")
];

const excluded = [
  { game_track_id: 8, track_name: "Hockenheim", reason: "not_in_full_f1_2021_track_pack" },
  { game_track_id: 21, track_name: "Sakhir Short", reason: "short_layout_excluded" },
  { game_track_id: 22, track_name: "Silverstone Short", reason: "short_layout_excluded" },
  { game_track_id: 23, track_name: "COTA Short", reason: "short_layout_excluded" },
  { game_track_id: 24, track_name: "Suzuka Short", reason: "short_layout_excluded" },
  { game_track_id: 25, track_name: "Hanoi", reason: "not_in_full_f1_2021_track_pack" }
];

fs.mkdirSync(mapRoot, { recursive: true });
const entries = circuits.map((entry) => entry.representation === "telemetry_seed" ? buildSeedEntry(entry) : buildStaticEntry(entry));
const manifest = {
  schema_version: 1,
  pack_id: "lapsignal-f1-2021-full-circuits",
  game_id: "f1_2021",
  packet_format: 2021,
  expected_track_count: 24,
  supported_track_ids: entries.map((entry) => entry.game_track_id),
  excluded,
  entries
};
fs.writeFileSync(path.join(packRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
validateManifest(manifest);
console.log(`Built ${entries.length} circuit entries (${entries.filter((entry) => entry.representation === "packaged_static").length} static, ${entries.filter((entry) => entry.representation === "telemetry_seed").length} telemetry seeds).`);

function telemetry(gameTrackId, trackId, trackName, expectedTrackLengthM, layoutVersion, direction) {
  return { gameTrackId, trackId, trackName, expectedTrackLengthM, layoutVersion, direction, representation: "telemetry_seed" };
}

function seed(gameTrackId, trackId, trackName, expectedTrackLengthM, sourceLayoutId, layoutVersion, direction, sourceSvgSha256, reverseSourcePath = false) {
  return { gameTrackId, trackId, trackName, expectedTrackLengthM, sourceLayoutId, layoutVersion, direction, sourceSvgSha256, reverseSourcePath, representation: "packaged_static" };
}

function buildSeedEntry(entry) {
  const file = findSeed(entry.gameTrackId);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Math.round(payload.track_length_m) !== entry.expectedTrackLengthM || payload.game_track_id !== entry.gameTrackId) {
    throw new Error(`Telemetry seed identity mismatch for track ${entry.gameTrackId}`);
  }
  return {
    game_track_id: entry.gameTrackId,
    track_id: entry.trackId,
    track_name: entry.trackName,
    expected_track_length_m: entry.expectedTrackLengthM,
    track_length_tolerance_m: 2,
    layout_fingerprint: payload.layout_fingerprint,
    layout_version: entry.layoutVersion,
    direction: entry.direction,
    path_direction: "racing_direction",
    start_finish_progress: 0,
    display_rotation_deg: 0,
    validation_status: "exact_game_telemetry_seed",
    representation: "telemetry_seed",
    asset_path: path.relative(packRoot, file).replaceAll("\\", "/"),
    positioning_capabilities: ["exact_local_world_transform", "seed_world_transform", "distance_projected"],
    geometry_checksum: payload.geometry_checksum,
    source: {
      type: "built_in_telemetry_seed",
      attribution: "LapSignal normalized non-personal F1 2021 telemetry seed",
      privacy: "normalized_non_personal",
      runtime_network_required: false
    }
  };
}

function buildStaticEntry(entry) {
  const sourceFile = path.join(sourceRoot, `${entry.sourceLayoutId}.svg`);
  const source = fs.readFileSync(sourceFile, "utf8");
  const sourceHash = sha256(source);
  if (sourceHash !== entry.sourceSvgSha256) throw new Error(`Source checksum mismatch: ${entry.sourceLayoutId}`);
  const pathData = source.match(/\sd="([^"]+)"/)?.[1];
  if (!pathData) throw new Error(`No path data in ${entry.sourceLayoutId}.svg`);
  const properties = new svgPathProperties(pathData);
  const totalLength = properties.getTotalLength();
  let rawPoints = Array.from({ length: pointCount }, (_, index) => properties.getPointAtLength(totalLength * index / pointCount));
  if (entry.reverseSourcePath) rawPoints = [rawPoints[0], ...rawPoints.slice(1).reverse()];
  const points = normalize(rawPoints).map((point, index) => ({ progress: round(index / pointCount, 6), x: round(point.x, 3), y: round(point.y, 3) }));
  const geometryChecksum = sha256(JSON.stringify(points));
  const assetName = `${String(entry.gameTrackId).padStart(2, "0")}-${entry.trackId}.json`;
  const asset = {
    schema_version: 1,
    asset_type: "packaged_static_centreline",
    game_id: "f1_2021",
    packet_format: 2021,
    game_track_id: entry.gameTrackId,
    track_id: entry.trackId,
    track_name: entry.trackName,
    expected_track_length_m: entry.expectedTrackLengthM,
    track_length_tolerance_m: 35,
    layout_fingerprint: `f1_2021:2021:${entry.gameTrackId}:${entry.expectedTrackLengthM}`,
    layout_id: entry.sourceLayoutId,
    layout_version: entry.layoutVersion,
    direction: entry.direction,
    path_direction: "racing_direction",
    source_path_reversed: entry.reverseSourcePath,
    progress_origin: "start_finish_at_source_path_origin",
    start_finish_progress: 0,
    display_rotation_deg: 0,
    validation_status: "verified_against_secondary_reference",
    positioning_mode: "distance_projected",
    geometry_kind: "packaged_static_centreline",
    view_box: { width: 1000, height: 600 },
    points,
    is_closed: true,
    start_finish: points[0],
    geometry_checksum: geometryChecksum,
    source: {
      type: "licensed_versioned_svg",
      project: "F1DB",
      author: "Jules Roy / F1DB contributors",
      license: "CC-BY-4.0",
      attribution: "Circuit geometry by Jules Roy and F1DB contributors, licensed CC BY 4.0; normalized by LapSignal.",
      repository_url: "https://github.com/f1db/f1db",
      asset_url: `https://github.com/f1db/f1db/blob/${sourceCommit}/src/assets/circuits/black/${entry.sourceLayoutId}.svg`,
      layout_metadata_url: `https://github.com/f1db/f1db/tree/${sourceCommit}/src/data/circuits`,
      source_commit: sourceCommit,
      source_svg_sha256: sourceHash,
      validation_references: [
        `https://github.com/f1db/f1db/blob/${sourceCommit}/src/assets/circuits/black/${entry.sourceLayoutId}.svg`,
        secondaryReferences[entry.sourceLayoutId]
      ],
      retrieved_at: retrievedAt,
      transform: `arc-length sample ${pointCount} points; aspect-fit 1000x600; 48px padding${entry.reverseSourcePath ? "; reversed to declared racing direction" : ""}`,
      runtime_network_required: false
    }
  };
  fs.writeFileSync(path.join(mapRoot, assetName), `${JSON.stringify(asset, null, 2)}\n`);
  return {
    game_track_id: entry.gameTrackId,
    track_id: entry.trackId,
    track_name: entry.trackName,
    expected_track_length_m: entry.expectedTrackLengthM,
    track_length_tolerance_m: 35,
    layout_fingerprint: asset.layout_fingerprint,
    layout_version: entry.layoutVersion,
    direction: entry.direction,
    path_direction: asset.path_direction,
    start_finish_progress: 0,
    display_rotation_deg: 0,
    validation_status: asset.validation_status,
    representation: "packaged_static",
    asset_path: `maps/${assetName}`,
    positioning_capabilities: ["exact_local_world_transform", "distance_projected", "static_without_marker"],
    geometry_checksum: geometryChecksum,
    source: asset.source
  };
}

function findSeed(gameTrackId) {
  const directory = path.join(root, "data", "circuit-seeds");
  const matches = fs.readdirSync(directory).filter((name) => name.includes(`-${gameTrackId}-`) && name.endsWith(".seed.json"));
  if (matches.length !== 1) throw new Error(`Expected one telemetry seed for track ${gameTrackId}, found ${matches.length}`);
  return path.join(directory, matches[0]);
}

function normalize(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min((1000 - 96) / (maxX - minX), (600 - 96) / (maxY - minY));
  const width = (maxX - minX) * scale, height = (maxY - minY) * scale;
  const offsetX = (1000 - width) / 2, offsetY = (600 - height) / 2;
  return points.map((point) => ({ x: (point.x - minX) * scale + offsetX, y: (point.y - minY) * scale + offsetY }));
}

function validateManifest(manifest) {
  const required = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 26, 27, 28, 29];
  const actual = manifest.entries.map((entry) => entry.game_track_id);
  if (JSON.stringify(actual) !== JSON.stringify(required)) throw new Error(`Track ID contract mismatch: ${actual.join(",")}`);
  if (new Set(actual).size !== 24) throw new Error("Duplicate circuit-map track ID");
  if (manifest.entries.filter((entry) => entry.representation === "packaged_static").length !== 16) throw new Error("Static-map count must be 16");
  if (manifest.entries.filter((entry) => entry.representation === "telemetry_seed").length !== 8) throw new Error("Telemetry-seed count must be 8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function geoJson(file) {
  return `https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/${file}.geojson`;
}
