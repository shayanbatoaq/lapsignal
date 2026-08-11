import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSessionDetail, parseSessionSummaries } from "./session-contract";
import type { Session, SessionDetail, SessionSummary, TelemetryPoint, TelemetryTrace } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function fixtureSessions(): Promise<Session[]> {
  const path = resolve(process.cwd(), "../../data/demo/sessions.json");
  return JSON.parse(await readFile(path, "utf8")) as Session[];
}

export async function getSessions(): Promise<Session[]> {
  try {
    const response = await fetch(`${API_URL}/v1/sessions?page_size=50`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("API unavailable");
    const list = (await response.json()).items as Array<Record<string, unknown>>;
    const full = await Promise.all(
      list.map(async (item) => {
        const detail = await fetch(`${API_URL}/v1/sessions/${item.id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!detail.ok) throw new Error("detail unavailable");
        return detail.json() as Promise<Session>;
      })
    );
    return full;
  } catch {
    return fixtureSessions();
  }
}

function summarizeSession(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    game_id: session.game_id,
    game_label: session.game_label,
    track_id: session.track_id,
    track_name: session.track_name,
    car_id: session.car_id,
    car_class: session.car_class,
    session_type: session.session_type,
    input_device: session.input_device,
    started_at: session.started_at,
    demo_data: session.demo_data,
    analysis_status: session.analysis_status,
    lap_count: session.laps.length,
    clean_lap_count: session.metrics.pace.clean_laps,
    best_lap_ms: session.metrics.pace.best_lap_ms,
    consistency_score: session.metrics.pace.consistency_score
  };
}

export async function getSessionSummaries(request: typeof fetch = fetch): Promise<SessionSummary[]> {
  try {
    const response = await request(`${API_URL}/v1/sessions?page_size=50`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("API unavailable");
    const sessions = parseSessionSummaries(await response.json());
    if (!sessions) throw new Error("Invalid session summary response");
    return sessions;
  } catch {
    return (await fixtureSessions()).map(summarizeSession);
  }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const result = await getSessionDetail(sessionId);
  if (result.status !== "ok") return null;
  const session = result.session;
  if (!session.metrics.pace || !session.metrics.stint || !session.metrics.braking || !session.metrics.throttle || !session.metrics.steering || !session.report) return null;
  return session as Session;
}

export type SessionDetailResult =
  | { status: "ok"; session: SessionDetail }
  | { status: "processing"; session: SessionDetail | null }
  | { status: "not_found" | "unreachable" | "invalid_response" | "server_error"; session: null };

const processingStatuses = new Set(["collecting", "recording", "finalized", "finalizing", "processing", "analyzing", "pending"]);

export async function getSessionDetail(
  sessionId: string,
  request: typeof fetch = fetch
): Promise<SessionDetailResult> {
  let response: Response;
  try {
    response = await request(`${API_URL}/v1/sessions/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return { status: "unreachable", session: null };
  }
  if (response.status === 404) return { status: "not_found", session: null };
  if ([202, 409, 425].includes(response.status)) return { status: "processing", session: null };
  if (response.status >= 500) return { status: "server_error", session: null };
  if (!response.ok) return { status: "invalid_response", session: null };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "invalid_response", session: null };
  }
  const session = parseSessionDetail(payload);
  if (!session) return { status: "invalid_response", session: null };
  if (processingStatuses.has(session.analysis_status.toLowerCase())) {
    return { status: "processing", session };
  }
  return { status: "ok", session };
}

export async function getReport(reportId: string) {
  const session = (await getSessions()).find((item) => item.report?.id === reportId);
  return session?.report ?? null;
}

export async function getTelemetry(
  session: Session | SessionDetail,
  lapNumbers: number[],
  request: typeof fetch = fetch
): Promise<TelemetryTrace[]> {
  try {
    const query = new URLSearchParams({ lap_numbers: lapNumbers.join(","), max_points: "180" });
    const response = await request(`${API_URL}/v1/sessions/${session.id}/telemetry?${query}`, { cache: "no-store", signal: AbortSignal.timeout(session.demo_data ? 1800 : 15000) });
    if (!response.ok) throw new Error("telemetry unavailable");
    const payload = await response.json() as { traces: TelemetryTrace[] };
    if (!payload.traces.length) {
      return session.demo_data ? telemetryForLaps(session, lapNumbers) : [];
    }
    return payload.traces;
  } catch {
    return session.demo_data ? telemetryForLaps(session, lapNumbers) : [];
  }
}

export function telemetryForLaps(session: Session | SessionDetail, lapNumbers: number[]): TelemetryTrace[] {
  const trackLength = session.track_length_m;
  if (!trackLength || session.laps.length === 0) return [];
  return lapNumbers.map((lapNumber) => {
    const lap = session.laps.find((item) => item.lap_number === lapNumber) ?? session.laps[0]!;
    const count = 240;
    const samples: TelemetryPoint[] = Array.from({ length: count }, (_, index) => {
      const fraction = index / (count - 1);
      const distance = fraction * trackLength;
      const corners = [0.12, 0.28, 0.46, 0.64, 0.82, 0.94];
      let cornerEffect = 0;
      let brake = 0;
      let throttle = 1;
      let steer = 0.01 * Math.sin(fraction * Math.PI * 4);
      corners.forEach((centreFraction, cornerIndex) => {
        const centre = centreFraction * trackLength;
        const scale = trackLength * (0.012 + (cornerIndex % 2) * 0.003);
        const offset = distance - centre;
        const gaussian = Math.exp(-((offset / scale) ** 2));
        cornerEffect += gaussian * (78 + (cornerIndex % 3) * 18);
        const brakeStart = centre - trackLength * 0.026 + ((lapNumber % 4) - 1.5) * 7;
        const brakeEnd = centre - trackLength * 0.004;
        if (distance >= brakeStart && distance <= brakeEnd) {
          const phase = (distance - brakeStart) / Math.max(1, brakeEnd - brakeStart);
          brake = Math.max(brake, Math.min(1, 0.35 + Math.sin(phase * Math.PI) * 0.63));
          throttle = 0;
        } else if (distance > brakeEnd && distance < centre + trackLength * 0.012) {
          throttle = Math.min(throttle, Math.max(0, (distance - centre) / (trackLength * 0.012)));
        }
        steer += Math.sin((offset / scale) * Math.PI) * gaussian * (cornerIndex % 2 ? 0.62 : -0.55);
      });
      const speed = Math.max(68, 318 - cornerEffect + Math.sin(index * 0.71 + lapNumber) * 1.8);
      const gear = Math.max(1, Math.min(8, Math.floor((speed - 25) / 38) + 1));
      return {
        lap_distance_m: Math.round(distance * 10) / 10,
        speed_kph: Math.round(speed * 10) / 10,
        throttle_0_1: Math.round(throttle * 1000) / 1000,
        brake_0_1: Math.round(brake * 1000) / 1000,
        steer_minus1_1: Math.round(Math.max(-1, Math.min(1, steer)) * 1000) / 1000,
        gear,
        rpm: Math.round(6200 + gear * 620 + throttle * 3800),
        current_lap_time_ms: Math.round(fraction * (lap.lap_time_ms ?? 0))
      };
    });
    return { lap_number: lap.lap_number, lap_time_ms: lap.lap_time_ms, valid: lap.valid, quality_score: lap.quality_score, samples };
  });
}
