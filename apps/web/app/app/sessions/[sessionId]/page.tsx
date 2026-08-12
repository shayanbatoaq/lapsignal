import { ArrowLeft, Columns3, Download, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisCoverage, ProvenanceList, SessionStorageBanner, UnavailableAnalysis } from "@/components/SessionAnalysis";
import { TelemetryChart } from "@/components/TelemetryChart";
import { TrackMap } from "@/components/TrackMap";
import { EvidenceCard, MetricCard, SectionHeading, StateCard } from "@/components/UI";
import { getSessionDetail, getTelemetry } from "@/lib/data";
import type { Lap, SessionDetail } from "@/lib/types";
import { formatLapTime } from "@lapsignal/telemetry-domain";
import { PerformanceModeControl } from "../PerformanceModeControl";
import { ProcessingSessionState, SessionRequestState } from "./SessionDetailState";

export default async function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const result = await getSessionDetail(sessionId);
  if (result.status === "not_found") notFound();
  if (result.status === "processing") return <ProcessingSessionState/>;
  if (result.status !== "ok") return <SessionRequestState status={result.status}/>;
  return <SessionDetailContent session={result.session}/>;
}

export async function SessionDetailContent({ session }: { session: SessionDetail }) {
  const pace = session.metrics.pace;
  const stint = session.metrics.stint;
  const clean = session.laps.filter((lap) => lap.valid);
  const timed = session.laps.filter((lap) => lap.lap_time_ms !== null);
  const timedValues = timed.map((lap) => lap.lap_time_ms).filter((value): value is number => value !== null);
  const trendBaseline = pace?.best_lap_ms ?? (timedValues.length ? Math.min(...timedValues) : 0);
  const selected = (clean.length ? clean : session.laps.filter((lap) => lap.coaching_available)).slice(0, 2).map((lap) => lap.lap_number);
  const traces = selected.length ? await getTelemetry(session, selected) : [];
  return <>
    <SessionStorageBanner/>
    <div className="session-detail-head">
      <div>
        <Link className="tag" href="/app/sessions"><ArrowLeft size={12}/> Session library</Link>
        <h2>{session.track_name}</h2>
        <p>{session.game_label} · {session.car_class} · {session.session_type} · {session.input_device}</p>
        <PerformanceModeControl sessionId={session.id} initial={session.performance_mode ?? "unknown"} source={session.performance_mode_source ?? "unknown"}/>
      </div>
      <div className="detail-actions">
        <Link className="button secondary small" href={`/app/compare?session=${session.id}`}><Columns3 size={14}/> Compare laps</Link>
        <Link className="button small" href={`/app/coach?session=${session.id}`}><ListChecks size={14}/> Open debrief</Link>
        <button className="icon-button" aria-label="Export summary"><Download size={15}/></button>
      </div>
    </div>
    <div className="dashboard-grid">
      <div className="span-3"><MetricCard label="Best clean lap" value={pace ? formatLapTime(pace.best_lap_ms) : "—"} detail={pace ? `lap ${clean.find((lap) => lap.lap_time_ms === pace.best_lap_ms)?.lap_number ?? "—"}` : "Analysis unavailable"}/></div>
      <div className="span-3"><MetricCard label="Theoretical best" value={pace ? formatLapTime(pace.theoretical_best_ms) : "—"} detail={pace?.best_lap_ms !== null && pace?.best_lap_ms !== undefined && pace.theoretical_best_ms !== null ? `${((pace.best_lap_ms - pace.theoretical_best_ms) / 1000).toFixed(3)} s available` : "Clean timing unavailable"}/></div>
      <div className="span-3"><MetricCard label="Median clean lap" value={pace ? formatLapTime(pace.median_lap_ms) : "—"} detail={pace ? `${pace.clean_laps} clean laps` : "Analysis unavailable"}/></div>
      <div className="span-3"><MetricCard label="Consistency" value={pace ? `${pace.consistency_score}` : "—"} detail={pace ? "robust score / 100" : "Analysis unavailable"}/></div>
      <section className="span-8 surface-card">
        <SectionHeading eyebrow="Stint overview" title="Clean-lap shape"/>
        {timed.length ? <div className="trend-chart"><svg viewBox="0 0 700 220" preserveAspectRatio="none" role="img" aria-label="Lap time trend across the stint">{[30, 80, 130, 180].map((y) => <line className="trend-grid" x1="0" x2="700" y1={y} y2={y} key={y}/>)}<polyline className="trend-line" points={timed.map((lap, index) => `${index * (700 / Math.max(1, timed.length - 1))},${170 - ((lap.lap_time_ms ?? trendBaseline) - trendBaseline) / 18}`).join(" ")}/>{timed.map((lap, index) => <circle className="trend-point" cx={index * (700 / Math.max(1, timed.length - 1))} cy={170 - ((lap.lap_time_ms ?? trendBaseline) - trendBaseline) / 18} r="4" key={lap.id}/>)}</svg></div> : <UnavailableAnalysis label="Lap-time trend"/>}
        {pace && stint ? <div className="technical-list"><div className="technical-row"><span>Pace degradation</span><strong>{pace.pace_degradation_ms_per_lap === null ? "Not available" : `${pace.pace_degradation_ms_per_lap} ms/lap`}</strong></div><div className="technical-row"><span>Long-run stability</span><strong>{stint.long_run_stability_score}/100</strong></div><div className="technical-row"><span>Tyre-wear correlation</span><strong>{stint.tyre_wear_correlation ?? "Not available"}</strong></div></div> : <UnavailableAnalysis label="Stint analysis"/>}
      </section>
      <section className="span-4 surface-card"><SectionHeading eyebrow="Distance analysis" title="Time-loss zones"/><TrackMap circuitMap={session.circuit_map ?? undefined} trackName={session.track_name} online={false}/></section>
      <section className="span-12"><SectionHeading eyebrow="Verified findings" title="Highest-value signals"/>{session.findings.length ? <div className="findings-grid">{session.findings.map((finding) => <EvidenceCard finding={finding} key={finding.id}/>)}</div> : <StateCard title="Findings unavailable">No evidence-backed findings were recorded for this session.</StateCard>}</section>
      <section className="span-12"><SectionHeading eyebrow="Measured · distance aligned" title={selected.length ? `Telemetry · laps ${selected.join(" and ")}` : "Telemetry"}/>{traces.length ? <TelemetryChart traces={traces}/> : <StateCard title="Telemetry unavailable">No saved distance-aligned trace is available for the selected laps. Lap times and analysis remain unchanged.</StateCard>}</section>
      <section className="span-8 surface-card table-card"><SectionHeading eyebrow="Lap preparation" title="Lap classification"/>{session.laps.length ? <LapTable laps={session.laps}/> : <StateCard title="Lap data unavailable">No completed laps have been materialized for this session yet.</StateCard>}</section>
      <section className="span-4 surface-card"><SectionHeading eyebrow="Coverage" title="Analysis groups"/><AnalysisCoverage metrics={session.metrics}/></section>
      <section className="span-12 surface-card"><SectionHeading eyebrow="Provenance" title="Analysis chain"/><ProvenanceList provenance={session.provenance}/></section>
    </div>
  </>;
}

function LapTable({ laps }: { laps: Lap[] }) {
  return <table className="lap-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Lap</th><th>Status</th><th>Sector 1</th><th>Sector 2</th><th>Lap time</th></tr></thead><tbody>{laps.map((lap) => <tr key={lap.id}><td><input className="lap-checkbox" type="checkbox" aria-label={`Select lap ${lap.lap_number}`} suppressHydrationWarning/></td><td className="mono">{lap.lap_number}</td><td><span className={`lap-status ${lap.valid ? "" : "invalid"}`}>{lap.status_label ?? (lap.valid ? lap.classification : "Invalid lap · coaching available")}</span></td><td className="mono">{formatLapTime(lap.sector_times_ms[0] ?? null)}</td><td className="mono">{formatLapTime(lap.sector_times_ms[1] ?? null)}</td><td className="lap-time">{formatLapTime(lap.lap_time_ms)}</td></tr>)}</tbody></table>;
}
