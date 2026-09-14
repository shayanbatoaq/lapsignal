import "server-only";
import { parseSessionDetail, parseSessionSummaries } from "./session-contract";
import type { Session, SessionDetail, SessionSummary, TelemetryTrace } from "./types";
import { getRuntimeMode } from "./runtime-server";
import { getShowcaseSession, getShowcaseTelemetry, showcaseFeaturedSessionId, showcaseSessions, showcaseSummaries } from "./showcase-data";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export type DataStatus = "ok" | "unreachable" | "invalid_response" | "server_error";
export interface LapSignalDataProvider {
  readonly mode: "local" | "showcase";
  sessions(request?: typeof fetch): Promise<{ status: DataStatus; sessions: Session[] }>;
  summaries(request?: typeof fetch): Promise<{ status: DataStatus; sessions: SessionSummary[] }>;
  session(id: string, request?: typeof fetch): Promise<{ status: DataStatus | "processing" | "not_found"; session: SessionDetail | null }>;
  telemetry(session: Session | SessionDetail, lapNumbers: number[], request?: typeof fetch): Promise<TelemetryTrace[]>;
  featuredSessionId(): string | null;
  defaultComparison(): { session: Session; traces: TelemetryTrace[]; labels: Record<number, string> } | null;
}

class ShowcaseDataProvider implements LapSignalDataProvider {
  readonly mode = "showcase" as const;
  async sessions() { return { status: "ok" as const, sessions: [...showcaseSessions].reverse() }; }
  async summaries() { return { status: "ok" as const, sessions: [...showcaseSummaries].reverse() }; }
  async session(id: string) { const session = getShowcaseSession(id); return session ? { status: "ok" as const, session } : { status: "not_found" as const, session: null }; }
  async telemetry(session: Session | SessionDetail, lapNumbers: number[]) { return getShowcaseTelemetry(session.id, lapNumbers); }
  featuredSessionId() { return showcaseFeaturedSessionId; }
  defaultComparison() {
    const baseline = getShowcaseSession("showcase:session:baseline")!; const improved = getShowcaseSession(showcaseFeaturedSessionId)!;
    const baselineLap = baseline.laps.find((lap) => lap.lap_time_ms === baseline.metrics.pace.best_lap_ms)!;
    const improvedLap = improved.laps.find((lap) => lap.lap_time_ms === improved.metrics.pace.best_lap_ms)!;
    const traces = [getShowcaseTelemetry(baseline.id, [baselineLap.lap_number])[0]!, getShowcaseTelemetry(improved.id, [improvedLap.lap_number])[0]!];
    return { session: improved, traces, labels: { [baselineLap.lap_number]: `Baseline · lap ${baselineLap.lap_number}`, [improvedLap.lap_number]: `Practice 03 · lap ${improvedLap.lap_number}` } };
  }
}

const processingStatuses = new Set(["collecting", "recording", "finalized", "finalizing", "processing", "analyzing", "pending"]);
class LocalApiDataProvider implements LapSignalDataProvider {
  readonly mode = "local" as const;
  async sessions(request: typeof fetch = fetch) {
    try {
      const response = await request(`${API_URL}/v1/sessions?page_size=50`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.status >= 500) return { status: "server_error" as const, sessions: [] };
      if (!response.ok) return { status: "invalid_response" as const, sessions: [] };
      const list = (await response.json()).items as Array<Record<string, unknown>>;
      const full = await Promise.all(list.map(async (item) => { const detail = await request(`${API_URL}/v1/sessions/${item.id}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }); return detail.ok ? parseSessionDetail(await detail.json()) : null; }));
      if (full.some((item) => item === null)) return { status: "invalid_response" as const, sessions: [] };
      return { status: "ok" as const, sessions: full as Session[] };
    } catch { return { status: "unreachable" as const, sessions: [] }; }
  }
  async summaries(request: typeof fetch = fetch) {
    try {
      const response = await request(`${API_URL}/v1/sessions?page_size=50`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (response.status >= 500) return { status: "server_error" as const, sessions: [] };
      if (!response.ok) return { status: "invalid_response" as const, sessions: [] };
      const sessions = parseSessionSummaries(await response.json());
      return sessions ? { status: "ok" as const, sessions } : { status: "invalid_response" as const, sessions: [] };
    } catch { return { status: "unreachable" as const, sessions: [] }; }
  }
  async session(id: string, request: typeof fetch = fetch) {
    let response: Response;
    try { response = await request(`${API_URL}/v1/sessions/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }); }
    catch { return { status: "unreachable" as const, session: null }; }
    if (response.status === 404) return { status: "not_found" as const, session: null };
    if ([202, 409, 425].includes(response.status)) return { status: "processing" as const, session: null };
    if (response.status >= 500) return { status: "server_error" as const, session: null };
    if (!response.ok) return { status: "invalid_response" as const, session: null };
    try { const session = parseSessionDetail(await response.json()); if (!session) return { status: "invalid_response" as const, session: null };
      return processingStatuses.has(session.analysis_status.toLowerCase()) ? { status: "processing" as const, session } : { status: "ok" as const, session }; }
    catch { return { status: "invalid_response" as const, session: null }; }
  }
  async telemetry(session: Session | SessionDetail, lapNumbers: number[], request: typeof fetch = fetch) {
    try { const query = new URLSearchParams({ lap_numbers: lapNumbers.join(","), max_points: "180" });
      const response = await request(`${API_URL}/v1/sessions/${session.id}/telemetry?${query}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) return []; return ((await response.json()) as { traces: TelemetryTrace[] }).traces; }
    catch { return []; }
  }
  featuredSessionId() { return null; }
  defaultComparison() { return null; }
}

const localProvider = new LocalApiDataProvider(); const showcaseProvider = new ShowcaseDataProvider();
export function getDataProvider(request?: typeof fetch): LapSignalDataProvider {
  if (request && request !== fetch) return localProvider;
  return getRuntimeMode() === "showcase" ? showcaseProvider : localProvider;
}
