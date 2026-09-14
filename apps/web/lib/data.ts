import "server-only";
import { getDataProvider } from "./data-provider";
import type { Session, SessionDetail, SessionSummary } from "./types";

export type SessionListResult<T> = { status: "ok" | "unreachable" | "invalid_response" | "server_error"; sessions: T[] };
export type SessionDetailResult =
  | { status: "ok"; session: SessionDetail }
  | { status: "processing"; session: SessionDetail | null }
  | { status: "not_found" | "unreachable" | "invalid_response" | "server_error"; session: null };

export async function getSessionsResult(request?: typeof fetch): Promise<SessionListResult<Session>> {
  return getDataProvider(request).sessions(request);
}
export async function getSessions() { return (await getSessionsResult()).sessions; }
export async function getSessionSummariesResult(request?: typeof fetch): Promise<SessionListResult<SessionSummary>> {
  return getDataProvider(request).summaries(request);
}
export async function getSessionSummaries(request?: typeof fetch) { return (await getSessionSummariesResult(request)).sessions; }
export async function getSessionDetail(id: string, request?: typeof fetch): Promise<SessionDetailResult> {
  return getDataProvider(request).session(decodeURIComponent(id), request) as Promise<SessionDetailResult>;
}
export async function getSession(id: string) {
  const result = await getSessionDetail(id);
  if (result.status !== "ok") return null;
  const session = result.session;
  return session.metrics.pace && session.metrics.stint && session.metrics.braking && session.metrics.throttle && session.metrics.steering && session.report ? session as Session : null;
}
export async function getFeaturedSession() {
  const id = getDataProvider().featuredSessionId();
  return id ? getSession(id) : null;
}
export function getDefaultComparison() { return getDataProvider().defaultComparison(); }
export async function getReport(reportId: string) { const id = decodeURIComponent(reportId); return (await getSessions()).find((item) => item.report?.id === id)?.report ?? null; }
export async function getTelemetry(session: Session | SessionDetail, laps: number[], request?: typeof fetch) {
  return getDataProvider(request).telemetry(session, laps, request);
}
