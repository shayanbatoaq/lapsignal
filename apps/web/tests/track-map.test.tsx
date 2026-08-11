import type { CircuitCalibrationArtifact, CircuitMapStatus, CircuitStaticMapArtifact } from "@lapsignal/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TrackMap } from "@/components/TrackMap";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
});

afterEach(cleanup);

describe("beginner-first production circuit map", () => {
  it("shows a truthful learning state instead of a generic circuit", () => {
    render(<TrackMap trackName="Unknown circuit" online />);
    expect(screen.getByText("Start driving to learn this circuit. A valid lap is not required.")).toBeVisible();
    expect(document.querySelector(".track-line")).toBeNull();
    expect(document.body).not.toHaveTextContent(/normalized fallback|complete one valid lap/i);
  });

  it("shows learning progress without drawing invented geometry", () => {
    render(<TrackMap trackName="Baku" online circuitMap={status("calibrating", null, 0.62)} />);
    expect(screen.getByText("Learning circuit · 62%")).toBeVisible();
    expect(screen.getByLabelText("Calibration 62 percent complete")).toBeVisible();
    expect(document.querySelector(".track-line")).toBeNull();
  });

  it("draws only reliable partial segments and never closes unknown gaps", () => {
    const partial = artifact();
    partial.positioning_mode = "partial";
    partial.geometry_kind = "telemetry_derived_partial";
    partial.is_closed = false;
    partial.segments = [partial.points.slice(0, 15), partial.points.slice(35, 55)];
    partial.points = partial.segments.flat();
    render(<TrackMap trackName="Baku" online circuitMap={{ ...status("calibrating", partial, 0.44), map_source: "progressive" }} />);
    const paths = document.querySelectorAll("path.track-line");
    expect(paths).toHaveLength(2);
    paths.forEach((path) => expect(path.getAttribute("d")).not.toMatch(/Z$/));
  });

  it("moves the marker from lap distance on a built-in seed before any valid lap", async () => {
    const calibration = artifact();
    render(
      <TrackMap
        trackName="Baku"
        online
        circuitMap={{ ...status("distance_projected", calibration, 1), map_source: "built_in" }}
        sample={{ lap_number: 1, lap_distance_m: 1200, track_length_m: 5994 }}
      />
    );
    const map = screen.getByRole("img", { name: /Baku telemetry-derived circuit centreline/i });
    expect(map).toHaveAttribute("data-map-source", "built_in");
    await waitFor(() => expect(map.querySelector(".live-track-marker")).not.toHaveAttribute("visibility"));
  });

  it("renders packaged static geometry and projects the marker by lap distance", async () => {
    const calibration = staticArtifact();
    render(
      <TrackMap
        trackName="Melbourne"
        online
        circuitMap={{
          ...status("distance_projected", calibration, 1),
          map_source: "static",
          positioning_source: "lap_distance"
        }}
        sample={{ lap_number: 1, lap_distance_m: 1856, track_length_m: 5303 }}
      />
    );
    const map = screen.getByRole("img", { name: /Melbourne packaged static circuit centreline/i });
    expect(map).toHaveAttribute("data-map-source", "static");
    expect(screen.getByText("Packaged circuit centreline")).toBeVisible();
    await waitFor(() => expect(map.querySelector(".live-track-marker")).not.toHaveAttribute("visibility"));
  });

  it("upgrades the exact matching map to world-calibrated positioning", async () => {
    const calibration = artifact();
    render(
      <TrackMap
        trackName="Baku City Circuit"
        online
        circuitMap={status("world_calibrated", calibration, 1)}
        sample={{ lap_number: 2, lap_distance_m: 2400, track_length_m: 5994, position_x: 20, position_z: 10, yaw: Math.PI / 2 }}
      />
    );
    const map = screen.getByRole("img", { name: /Baku City Circuit telemetry-derived circuit centreline/i });
    expect(map).toHaveAttribute("data-track-id", "baku");
    expect(map).toHaveAttribute("data-map-state", "world_calibrated");
    await waitFor(() => expect(map.querySelector(".live-track-marker")).not.toHaveAttribute("visibility"));
  });

  it("freezes the marker when telemetry becomes stale or offline", async () => {
    const calibration = staticArtifact();
    const circuitMap = {
      ...status("distance_projected", calibration, 1),
      map_source: "static" as const,
      positioning_source: "lap_distance" as const
    };
    const view = render(
      <TrackMap
        trackName="Melbourne"
        online
        circuitMap={circuitMap}
        sample={{ lap_number: 1, lap_distance_m: 1000, track_length_m: 5303 }}
      />
    );
    const marker = document.querySelector(".live-track-marker")!;
    await waitFor(() => expect(marker).not.toHaveAttribute("visibility"));
    const before = marker.getAttribute("transform");
    view.rerender(
      <TrackMap
        trackName="Melbourne"
        online={false}
        circuitMap={circuitMap}
        sample={{ lap_number: 1, lap_distance_m: 5000, track_length_m: 5303 }}
      />
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(marker.getAttribute("transform")).toBe(before);
  });

  it("switches geometry and marker target on an exact session track change", async () => {
    const melbourne = staticArtifact();
    const paulRicard: CircuitStaticMapArtifact = {
      ...staticArtifact(),
      game_track_id: 1,
      track_id: "paul-ricard",
      track_name: "Paul Ricard",
      expected_track_length_m: 5814,
      layout_fingerprint: "f1_2021:2021:1:5814",
      layout_id: "paul-ricard-3",
      geometry_checksum: "c".repeat(64),
      points: staticArtifact().points.map((point) => ({ ...point, x: 1000 - point.x })),
      start_finish: { ...staticArtifact().points[0]!, x: 1000 - staticArtifact().points[0]!.x }
    };
    const view = render(
      <TrackMap
        trackName="Melbourne"
        online
        circuitMap={{ ...status("distance_projected", melbourne, 1), map_source: "static" }}
        sample={{ lap_number: 1, lap_distance_m: 800, track_length_m: 5303 }}
      />
    );
    const marker = document.querySelector(".live-track-marker")!;
    await waitFor(() => expect(marker).not.toHaveAttribute("visibility"));
    const before = marker.getAttribute("transform");
    view.rerender(
      <TrackMap
        trackName="Paul Ricard"
        online
        circuitMap={{ ...status("distance_projected", paulRicard, 1), map_source: "static" }}
        sample={{ lap_number: 1, lap_distance_m: 1800, track_length_m: 5814 }}
      />
    );
    await waitFor(() => expect(document.querySelector('[data-track-id="paul-ricard"]')).toBeVisible());
    await waitFor(() => expect(marker.getAttribute("transform")).not.toBe(before));
  });
});

function status(
  state: CircuitMapStatus["state"],
  calibration: CircuitCalibrationArtifact | CircuitStaticMapArtifact | null,
  progress: number
): CircuitMapStatus {
  const label = state === "calibrating" ? `Learning circuit · ${Math.round(progress * 100)}%` : state === "world_calibrated" ? "World calibrated" : state === "distance_projected" ? "Distance projected" : "Built-in map";
  return {
    state,
    label,
    message: state === "calibrating" ? "The map improves as you drive. A valid lap is not required." : "Positioning status",
    progress,
    layout_fingerprint: calibration?.layout_fingerprint ?? "f1_2021:2021:20:5994",
    calibration,
    map_source: calibration ? "local" : "progressive",
    refining: state !== "unavailable"
  };
}

function staticArtifact(): CircuitStaticMapArtifact {
  const points = Array.from({ length: 80 }, (_, index) => {
    const angle = index / 80 * Math.PI * 2;
    return { progress: index / 80, x: 500 + Math.cos(angle) * 420, y: 300 + Math.sin(angle) * 180 };
  });
  return {
    schema_version: 1,
    asset_type: "packaged_static_centreline",
    game_id: "f1_2021",
    packet_format: 2021,
    game_track_id: 0,
    track_id: "melbourne",
    track_name: "Melbourne",
    expected_track_length_m: 5303,
    track_length_tolerance_m: 35,
    layout_fingerprint: "f1_2021:2021:0:5303",
    layout_id: "melbourne-1",
    layout_version: "1996-2019 / F1 2021 game layout",
    direction: "clockwise",
    path_direction: "racing_direction",
    source_path_reversed: false,
    progress_origin: "start_finish_at_source_path_origin",
    start_finish_progress: 0,
    display_rotation_deg: 0,
    validation_status: "verified_against_secondary_reference",
    positioning_mode: "distance_projected",
    geometry_kind: "packaged_static_centreline",
    view_box: { width: 1000, height: 600 },
    points,
    is_closed: true,
    start_finish: points[0]!,
    geometry_checksum: "b".repeat(64),
    source: {
      type: "licensed_versioned_svg",
      project: "F1DB",
      author: "Jules Roy / F1DB contributors",
      license: "CC-BY-4.0",
      attribution: "Circuit geometry by Jules Roy and F1DB contributors, licensed CC BY 4.0; normalized by LapSignal.",
      repository_url: "https://github.com/f1db/f1db",
      asset_url: "https://github.com/f1db/f1db/blob/21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf/src/assets/circuits/black/melbourne-1.svg",
      layout_metadata_url: "https://github.com/f1db/f1db/tree/21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf/src/data/circuits",
      source_commit: "21d0bc8ae4a9dc1b26a0852bc0cd4ff12096adbf",
      source_svg_sha256: "a".repeat(64),
      validation_references: [
        "https://github.com/f1db/f1db",
        "https://commons.wikimedia.org/wiki/File:Circuit_Albert_Park.svg"
      ],
      retrieved_at: "2026-08-11",
      transform: "test fixture",
      runtime_network_required: false
    }
  };
}

function artifact(): CircuitCalibrationArtifact {
  const points = Array.from({ length: 80 }, (_, index) => {
    const angle = index / 80 * Math.PI * 2;
    return { progress: index / 80, x: 500 + Math.cos(angle) * 420, y: 300 + Math.sin(angle) * 180 };
  });
  return {
    schema_version: 1,
    calibration_id: "seed-baku",
    game_id: "f1_2021",
    packet_format: 2021,
    game_track_id: 20,
    track_id: "baku",
    track_name: "Baku",
    track_length_m: 5994,
    layout_fingerprint: "f1_2021:2021:20:5994",
    positioning_mode: "world_calibrated",
    geometry_kind: "telemetry_derived_centreline",
    view_box: { width: 1000, height: 600 },
    world_to_svg: { scale: 1, offset_x: 500, offset_y: 300, invert_z: true },
    points,
    segments: [points],
    is_closed: true,
    start_finish: points[0]!,
    geometry_checksum: "a".repeat(64),
    quality: { bin_count: 80, covered_bins: 80, coverage_ratio: 1, sample_count: 800, rejected_samples: 0, source_session_count: 1, maximum_gap_bins: 0, closure_distance_svg: 10, quality_score: 102 },
    provenance: { source: "built_in_telemetry_seed", description: "Synthetic normalized seed", calibration_method: "telemetry_derived_distance_bins", privacy: "normalized_non_personal" }
  };
}
