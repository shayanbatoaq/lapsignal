import { circuitMapStatusSchema } from "@lapsignal/contracts";

const anchors = "109.2,271.9 39.5,318 28,321.1 28.1,315 54,263.3 107.5,207.9 128.2,184.3 152.2,175.8 193.4,145.1 209.8,135 360,77.7 378.4,76.4 393.6,86.7 417.9,78.6 466.8,127.9 472,139.4 464.2,148.6 452.4,145.6 425.9,119.4 396,131 322.3,153.1 312.7,175.4 318.6,200 334.1,211.3 401.9,231.2 414.9,244 410,262.5 421.6,282.8 450.5,296.9 461.2,311.5 448.4,333.7 433.6,345.2 402.3,339.3 356.5,304.8 330.8,268 295.4,241.5 258.3,231.5 245.6,233.2 199.5,255.7 143,268.3 137.8,265.6 138.6,259.3 129.7,256.4".split(" ").map((pair) => pair.split(",").map(Number) as [number, number]);
const points = anchors.map(([x, y], index) => ({ progress: index / anchors.length, x: x * 1.9, y: y * 1.55 - 45 }));

export const showcaseCircuitMap = circuitMapStatusSchema.parse({
  state: "distance_projected", label: "Representative circuit centreline",
  message: "A compact, fictionalized Spa-Francorchamps centreline supports this public product preview.",
  progress: 1, layout_fingerprint: "showcase:spa-francorchamps:grand-prix",
  calibration: {
    schema_version: 1, calibration_id: "showcase:spa-map", game_id: "f1_2021", packet_format: 2021,
    game_track_id: 10, track_id: "spa-francorchamps", track_name: "Spa-Francorchamps", track_length_m: 7003,
    layout_fingerprint: "showcase:spa-francorchamps:grand-prix", positioning_mode: "distance_projected",
    geometry_kind: "telemetry_derived_centreline", view_box: { width: 1000, height: 600 },
    world_to_svg: { scale: 1, offset_x: 0, offset_y: 0, invert_z: true }, points, is_closed: true,
    start_finish: points[0], geometry_checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    quality: { bin_count: 160, covered_bins: 160, coverage_ratio: 1, sample_count: 160, rejected_samples: 0, quality_score: 1 },
    provenance: { source: "built_in_telemetry_seed", description: "Fictionalized representative centreline for the public product preview.", calibration_method: "telemetry_derived_distance_bins", privacy: "normalized_non_personal" }
  }, map_source: "built_in", positioning_source: "lap_distance", refining: false
});
