"use client";

import type { CircuitMapGeometry, CircuitMapStatus } from "@lapsignal/contracts";
import { Info, MapPinned } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  markerHeadingDegrees,
  normalizeLapProgress,
  transformWorldPoint
} from "@lapsignal/telemetry-domain";

interface LiveMapSample {
  lap_number?: unknown;
  lap_distance_m?: unknown;
  track_length_m?: unknown;
  position_x?: unknown;
  position_z?: unknown;
  yaw?: unknown;
}

interface MarkerTarget {
  x: number;
  y: number;
  heading: number;
}

interface TrackMapProps {
  circuitMap?: CircuitMapStatus | undefined;
  sample?: LiveMapSample | undefined;
  trackName: string;
  online: boolean;
}

const unavailableStatus: CircuitMapStatus = {
  state: "unavailable",
  label: "Circuit map unavailable",
  message: "Start driving to learn this circuit. A valid lap is not required.",
  progress: 0,
  layout_fingerprint: null,
  calibration: null,
  map_source: "none",
  positioning_source: "none",
  refining: false
};

const geometryPathCache = new Map<string, string[]>();

export const TrackMap = memo(function TrackMap({
  circuitMap = unavailableStatus,
  sample = {},
  trackName,
  online
}: TrackMapProps) {
  const calibration = circuitMap.calibration;
  const progress = normalizeLapProgress(sample.lap_distance_m, sample.track_length_m);
  const paths = useMemo(() => calibrationPaths(calibration), [calibration]);
  const markerRef = useRef<SVGGElement>(null);
  const traceRef = useRef<SVGPathElement>(null);
  const targetRef = useRef<MarkerTarget | null>(null);
  const currentRef = useRef<MarkerTarget | null>(null);
  const onlineRef = useRef(online);

  useEffect(() => {
    onlineRef.current = online;
    if (!online) targetRef.current = currentRef.current;
  }, [online]);

  useEffect(() => {
    if (!calibration || !online) return;
    const target = markerTarget(calibration, circuitMap.state, sample, progress);
    if (target) targetRef.current = target;
    if (traceRef.current) {
      traceRef.current.style.strokeDasharray = `${Math.max(0, progress ?? 0)} 1`;
    }
  }, [calibration, circuitMap.state, online, progress, sample]);

  useEffect(() => {
    if (!calibration) return;
    let animationFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = () => {
      const marker = markerRef.current;
      const target = targetRef.current;
      if (marker && target) {
        const current = currentRef.current ?? target;
        const smoothing = reducedMotion.matches || !onlineRef.current ? 1 : 0.24;
        const next = {
          x: current.x + (target.x - current.x) * smoothing,
          y: current.y + (target.y - current.y) * smoothing,
          heading: current.heading + shortestAngle(current.heading, target.heading) * smoothing
        };
        currentRef.current = next;
        marker.setAttribute("transform", `translate(${next.x} ${next.y}) rotate(${next.heading})`);
        marker.removeAttribute("visibility");
      }
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [calibration]);

  const lap = finiteNumber(sample.lap_number);
  const geometryLabel = calibration?.geometry_kind === "packaged_static_centreline" ? "packaged static circuit centreline" : "telemetry-derived circuit centreline";
  const summary = calibration
    ? `${trackName} ${geometryLabel}${lap ? `, lap ${lap}` : ""}${progress != null ? `, approximately ${Math.round(progress * 100)} percent around the lap` : ""}. ${circuitMap.label}.`
    : `${trackName}. ${circuitMap.message}`;

  if (!calibration || paths.length === 0) {
    return (
      <div className="track-map track-map-empty" role="img" aria-label={summary} data-map-state={circuitMap.state}>
        <div className="calibration-state">
          <span className="calibration-icon" aria-hidden="true"><MapPinned size={28} /></span>
          <strong>{circuitMap.label}</strong>
          <p>{circuitMap.message}</p>
          {circuitMap.state === "calibrating" && (
            <div className="calibration-progress" aria-label={`Calibration ${Math.round(circuitMap.progress * 100)} percent complete`}>
              <span style={{ width: `${Math.round(circuitMap.progress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const startLine = startFinishLine(calibration);
  return (
    <div className="track-map" role="img" aria-label={summary} data-map-state={circuitMap.state} data-map-source={circuitMap.map_source} data-track-id={calibration.track_id}>
      <svg viewBox={`0 0 ${calibration.view_box.width} ${calibration.view_box.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {paths.map((path, index) => <path className="track-shadow" d={path} key={`shadow-${index}`} />)}
        {paths.map((path, index) => <path className="track-line" d={path} key={`line-${index}`} />)}
        {calibration.is_closed !== false && <path ref={traceRef} className="track-driven-line" d={paths[0]} pathLength="1" />}
        {calibration.is_closed !== false && <line className="track-start-finish" {...startLine} />}
        <g ref={markerRef} className="live-track-marker" visibility="hidden">
          <path d="M 11 0 L -7 -6 L -3 0 L -7 6 Z" />
          <circle cx="0" cy="0" r="2.4" />
        </g>
      </svg>
      <div className="map-legend">
        <span><i className="map-dot" /> Player</span>
        <span><i className="map-line" /> {calibration.geometry_kind === "packaged_static_centreline" ? "Packaged circuit centreline" : "Telemetry-derived centreline"}</span>
        <span className="map-mode">{circuitMap.refining && circuitMap.state !== "calibrating" ? "Refining map" : circuitMap.label}</span>
        <details className="map-diagnostic">
          <summary aria-label="Circuit positioning details"><Info size={13} /></summary>
          <p>{circuitMap.message} The line is a centreline reference, not surveyed circuit width or track boundaries.</p>
        </details>
      </div>
    </div>
  );
});

function calibrationPaths(calibration: CircuitMapGeometry | null): string[] {
  if (!calibration || calibration.points.length < 2) return [];
  const segments = "segments" in calibration && calibration.segments?.length ? calibration.segments : [calibration.points];
  const cacheKey = `${calibration.geometry_checksum}:${calibration.is_closed !== false}:${segments.map((segment) => segment.length).join(",")}`;
  const cached = geometryPathCache.get(cacheKey);
  if (cached) return cached;
  const paths = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => `${segment.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ")}${calibration.is_closed === false ? "" : " Z"}`);
  if (geometryPathCache.size >= 64) geometryPathCache.delete(geometryPathCache.keys().next().value ?? "");
  geometryPathCache.set(cacheKey, paths);
  return paths;
}

function markerTarget(
  calibration: CircuitMapGeometry,
  state: CircuitMapStatus["state"],
  sample: LiveMapSample,
  progress: number | null
): MarkerTarget | null {
  if (state === "world_calibrated" && "world_to_svg" in calibration) {
    const world = transformWorldPoint(sample.position_x, sample.position_z, calibration.world_to_svg);
    const heading = markerHeadingDegrees(sample.yaw);
    if (world && heading != null) return { ...world, heading };
  }
  if (progress == null) return null;
  return pointAlongClosedPath(calibration.points, progress);
}

function pointAlongClosedPath(points: CircuitMapGeometry["points"], progress: number): MarkerTarget | null {
  if (points.length < 2) return null;
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    return { point, next, length: Math.hypot(next.x - point.x, next.y - point.y) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= 0) return null;
  let target = Math.max(0, Math.min(1, progress)) * total;
  for (const segment of segments) {
    if (target <= segment.length || segment === segments.at(-1)) {
      const ratio = segment.length > 0 ? Math.min(1, target / segment.length) : 0;
      return {
        x: segment.point.x + (segment.next.x - segment.point.x) * ratio,
        y: segment.point.y + (segment.next.y - segment.point.y) * ratio,
        heading: (Math.atan2(segment.next.y - segment.point.y, segment.next.x - segment.point.x) * 180) / Math.PI
      };
    }
    target -= segment.length;
  }
  return null;
}

function startFinishLine(calibration: CircuitMapGeometry) {
  const first = calibration.points[0]!;
  const next = calibration.points[1] ?? first;
  const angle = Math.atan2(next.y - first.y, next.x - first.x) + Math.PI / 2;
  const half = Math.max(8, Math.min(calibration.view_box.width, calibration.view_box.height) * 0.018);
  return {
    x1: first.x - Math.cos(angle) * half,
    y1: first.y - Math.sin(angle) * half,
    x2: first.x + Math.cos(angle) * half,
    y2: first.y + Math.sin(angle) * half
  };
}

function shortestAngle(current: number, target: number) {
  return ((target - current + 540) % 360) - 180;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
