import "server-only";
import { parseSessionDetail, parseSessionSummaries } from "./session-contract";
import type { Session, SessionDetail, SessionSummary, TelemetryTrace } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type SessionListResult<T> = {
  status: "ok" | "unreachable" | "invalid_response" | "server_error";
  sessions: T[];
};

export async function getSessionsResult(request: typeof fetch = fetch): Promise<SessionListResult<Session>> {
  try {
    const response = await request(`${API_URL}/v1/sessions?page_size=50`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status >= 500) return { status: "server_error", sessions: [] };
    if (!response.ok) return { status: "invalid_response", sessions: [] };
    const list = (await response.json()).items as Array<Record<string, unknown>>;
    const full = await Promise.all(
      list.map(async (item) => {
        const detail = await request(`${API_URL}/v1/sessions/${item.id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!detail.ok) return null;
        return parseSessionDetail(await detail.json());
      })
    );
    if (full.some((item) => item === null)) return { status: "invalid_response", sessions: [] };
    return { status: "ok", sessions: full as Session[] };
  } catch {
    return { status: "unreachable", sessions: [] };
  }
}

export async function getSessions(): Promise<Session[]> {
  return (await getSessionsResult()).sessions;
}

export async function getSessionSummariesResult(request: typeof fetch = fetch): Promise<SessionListResult<SessionSummary>> {
  try {
    const response = await request(`${API_URL}/v1/sessions?page_size=50`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    if (response.status >= 500) return { status: "server_error", sessions: [] };
    if (!response.ok) return { status: "invalid_response", sessions: [] };
    const sessions = parseSessionSummaries(await response.json());
    if (!sessions) return { status: "invalid_response", sessions: [] };
    return { status: "ok", sessions };
  } catch {
    return { status: "unreachable", sessions: [] };
  }
}

export async function getSessionSummaries(request: typeof fetch = fetch): Promise<SessionSummary[]> {
  return (await getSessionSummariesResult(request)).sessions;
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
    const response = await request(`${API_URL}/v1/sessions/${session.id}/telemetry?${query}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("telemetry unavailable");
    const payload = await response.json() as { traces: TelemetryTrace[] };
    return payload.traces;
  } catch {
    return [];
  }
}
