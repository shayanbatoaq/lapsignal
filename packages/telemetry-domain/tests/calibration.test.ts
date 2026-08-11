import { describe, expect, it } from "vitest";
import {
  deriveTelemetryCalibration,
  layoutFingerprint,
  markerHeadingDegrees,
  normalizeLapProgress,
  ProgressiveCalibrationAccumulator,
  transformWorldPoint,
  type CalibrationTelemetrySample
} from "../src/index";

describe("beginner-first telemetry-derived circuit calibration", () => {
  it("derives distinct Baku and Spa centrelines without requiring next-lap proof", () => {
    const bakuCalibration = deriveTelemetryCalibration(lap(20, "baku", 5994, 1, bakuPoint));
    const spaCalibration = deriveTelemetryCalibration(lap(10, "spa-francorchamps", 7003, 1, spaPoint));
    expect(bakuCalibration).toMatchObject({ game_track_id: 20, track_id: "baku", is_closed: true });
    expect(spaCalibration).toMatchObject({ game_track_id: 10, track_id: "spa-francorchamps", is_closed: true });
    expect(bakuCalibration?.points).toHaveLength(400);
    expect(spaCalibration?.points).not.toEqual(bakuCalibration?.points);
  });

  it("uses reliable geometry from a completely invalid lap", () => {
    const invalid = lap(20, "baku", 5994, 1, bakuPoint).map((sample) => ({ ...sample, lap_invalid: true }));
    const calibration = deriveTelemetryCalibration(invalid);
    expect(calibration?.quality.coverage_ratio).toBe(1);
    expect(calibration?.quality.rejected_samples).toBe(0);
  });

  it("combines multiple incomplete attempts and sessions into one usable map", () => {
    const first = lap(20, "baku", 5994, 1, bakuPoint)
      .slice(0, 220)
      .map((sample) => ({ ...sample, session_uid: "beginner-a" }));
    const second = lap(20, "baku", 5994, 1, bakuPoint)
      .slice(180)
      .map((sample) => ({ ...sample, session_uid: "beginner-b" }));
    const calibration = deriveTelemetryCalibration([...first, ...second]);
    expect(calibration?.quality.coverage_ratio).toBe(1);
    expect(calibration?.quality.source_session_count).toBe(2);
  });

  it("quarantines a flashback while preserving prior bins", () => {
    const rows = lap(20, "baku", 5994, 1, bakuPoint);
    const accumulator = new ProgressiveCalibrationAccumulator(rows[0]!, { flashbackQuarantineSamples: 3 });
    rows.slice(0, 150).forEach((sample) => accumulator.ingest(sample));
    const before = accumulator.snapshot().bins.length;
    const flashback = { ...rows[80]!, frame_id: 20, timestamp_ms: 1000 };
    expect(accumulator.ingest(flashback)).toMatchObject({ accepted: false, reason: "flashback_quarantine" });
    rows.slice(151, 154).forEach((sample) => expect(accumulator.ingest(sample).reason).toBe("flashback_quarantine"));
    expect(accumulator.snapshot().bins.length).toBe(before);
    expect(accumulator.ingest(rows[154]!).accepted).toBe(true);
  });

  it("segments teleports and excludes pits and off-track surfaces sample by sample", () => {
    const rows = lap(20, "baku", 5994, 1, bakuPoint);
    const accumulator = new ProgressiveCalibrationAccumulator(rows[0]!);
    expect(accumulator.ingest(rows[0]!).accepted).toBe(true);
    expect(accumulator.ingest({ ...rows[1]!, position_x: 10_000 })).toMatchObject({
      accepted: false,
      reason: "teleport_or_impossible_jump",
      segment_id: 1
    });
    const surfaces = new ProgressiveCalibrationAccumulator(rows[40]!);
    expect(surfaces.ingest({ ...rows[40]!, pit_status: 1 }).reason).toBe("pit_or_garage");
    expect(surfaces.ingest({ ...rows[80]!, surface_type: [7, 7, 7, 7] }).reason).toBe("off_track_surface");
    expect(surfaces.ingest({ ...rows[120]!, surface_type: [1, 1, 0, 0] }).accepted).toBe(true);
  });

  it("interpolates small bounded gaps but refuses large unknown gaps", () => {
    const rows = lap(20, "baku", 5994, 1, bakuPoint);
    const smallGap = rows.filter((_, index) => index < 100 || index > 104);
    const largeGap = rows.filter((_, index) => index < 100 || index > 115);
    expect(deriveTelemetryCalibration(smallGap)?.is_closed).toBe(true);
    expect(deriveTelemetryCalibration(largeGap)).toBeNull();
    const accumulator = new ProgressiveCalibrationAccumulator(largeGap[0]!);
    largeGap.forEach((sample) => accumulator.ingest(sample));
    expect(accumulator.buildPartialDraft()).toMatchObject({ is_closed: false, geometry_kind: "telemetry_derived_partial" });
  });

  it("normalizes distances and keeps fingerprints, world transforms, and headings track-specific", () => {
    expect(normalizeLapProgress(-100, 1000)).toBeCloseTo(0.9);
    expect(normalizeLapProgress(1250, 1000)).toBeCloseTo(0.25);
    expect(normalizeLapProgress(Number.NaN, 1000)).toBeNull();
    const baku = lap(20, "baku", 5994, 1, bakuPoint);
    const spa = lap(10, "spa-francorchamps", 7003, 1, spaPoint);
    expect(layoutFingerprint(baku[0]!)).not.toBe(layoutFingerprint(spa[0]!));
    const calibration = deriveTelemetryCalibration(baku)!;
    expect(transformWorldPoint(10, 20, calibration.world_to_svg)).toEqual({
      x: 10 * calibration.world_to_svg.scale + calibration.world_to_svg.offset_x,
      y: calibration.world_to_svg.offset_y - 20 * calibration.world_to_svg.scale
    });
    expect(markerHeadingDegrees(0)).toBe(-90);
    expect(markerHeadingDegrees(Math.PI / 2)).toBe(0);
  });
});

function lap(
  gameTrackId: number,
  trackId: string,
  length: number,
  lapNumber: number,
  shape: (progress: number) => { x: number; z: number }
): CalibrationTelemetrySample[] {
  return Array.from({ length: 400 }, (_, index) => {
    const progress = index / 400;
    const point = shape(progress);
    const next = shape(progress + 1 / 400);
    return {
      timestamp_ms: (lapNumber - 1) * 30_000 + index * 50,
      frame_id: (lapNumber - 1) * 1000 + index,
      session_uid: "synthetic-session",
      game_id: "f1_2021",
      packet_format: 2021,
      game_track_id: gameTrackId,
      track_id: trackId,
      track_name: trackId === "baku" ? "Baku" : "Spa-Francorchamps",
      track_length_m: length,
      lap_number: lapNumber,
      lap_distance_m: progress * length,
      position_x: point.x,
      position_z: point.z,
      yaw: Math.atan2(next.x - point.x, next.z - point.z),
      speed_kph: 220,
      lap_invalid: false,
      pit_status: 0,
      driver_status: 4,
      surface_type: [0, 0, 0, 0]
    };
  });
}

function bakuPoint(progress: number) {
  return polylinePoint([
    [0, 0], [0, 720], [95, 760], [180, 700], [190, 520], [115, 485], [105, 400],
    [170, 350], [145, 300], [205, 250], [165, 190], [260, 150], [350, 75], [310, -40],
    [40, -70], [-340, -70], [-360, 0]
  ], progress);
}

function spaPoint(progress: number) {
  return polylinePoint([
    [0, 0], [-120, -80], [-250, -20], [-360, 130], [-250, 310], [-70, 420], [180, 460],
    [330, 330], [250, 170], [90, 125], [40, 250], [-80, 200], [-30, 70]
  ], progress);
}

function polylinePoint(vertices: Array<[number, number]>, progress: number) {
  const wrapped = ((progress % 1) + 1) % 1;
  const closed = [...vertices, vertices[0]!];
  const segment = Math.min(closed.length - 2, Math.floor(wrapped * (closed.length - 1)));
  const local = wrapped * (closed.length - 1) - segment;
  const start = closed[segment]!;
  const end = closed[segment + 1]!;
  return { x: start[0] + (end[0] - start[0]) * local, z: start[1] + (end[1] - start[1]) * local };
}
