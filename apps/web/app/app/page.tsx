import { Activity, ArrowRight, Gamepad2, Gauge, RadioTower, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { DemoBanner, MetricCard, SectionHeading, SessionRail } from "@/components/UI";
import { getSessions } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";

export default async function DashboardPage() {
  const sessions = await getSessions();
  const latest = sessions[0]!;
  const pace = latest.metrics.pace;
  const finding = latest.findings[0]!;
  const inputContexts = new Set(sessions.map((session) => session.input_device)).size;

  return <>
    <DemoBanner />
    <div className="dashboard-grid">
      <section className="span-8 surface-card session-hero">
        <div className="session-meta"><span className="tag demo">Seeded run</span><span className="tag">{latest.game_label}</span><span className="tag">{latest.input_device}</span></div>
        <h2>{latest.track_name}<br />{latest.session_type}</h2>
        <p>{latest.laps.length} laps · {pace.clean_laps} clean · analysis complete</p>
        <div className="session-primary-time"><span>Best clean lap</span><strong>{formatLapTime(pace.best_lap_ms)}</strong></div>
      </section>
      <section className="span-4 surface-card priority-panel">
        <div><p className="eyebrow">Pit-wall call · priority 01</p><h2 className="priority-title">{finding.title}</h2></div>
        <p>{finding.plain_language}</p>
        <div><div className="metric-detail"><span>Evidence confidence</span><span style={{marginLeft:"auto",color:"var(--positive)"}}>{Math.round(finding.confidence*100)}%</span></div><div className="progress-bar"><span style={{width:`${finding.confidence*100}%`}} /></div></div>
        <Link className="button small" href="/app/coach">Open full debrief <ArrowRight size={14}/></Link>
      </section>
      <div className="span-3"><MetricCard icon={Timer} label="Theoretical best" value={formatLapTime(pace.theoretical_best_ms)} detail={`${((pace.best_lap_ms-pace.theoretical_best_ms)/1000).toFixed(3)} s available`} /></div>
      <div className="span-3"><MetricCard icon={Activity} label="Consistency" value={`${pace.consistency_score}`} detail="stored clean-lap score" /></div>
      <div className="span-3"><MetricCard icon={Gauge} label="Long-run stability" value={`${latest.metrics.stint.long_run_stability_score}`} detail="stored stint score" /></div>
      <div className="span-3"><MetricCard icon={Gamepad2} label="Input contexts" value={`${inputContexts}`} detail="kept separate" /></div>
      <section className="span-7 surface-card flush">
        <div style={{padding:"18px 18px 8px"}}><SectionHeading eyebrow="Recorded work" title="Session register" action={<Link className="button ghost small" href="/app/sessions">View all</Link>} /></div>
        <div className="recent-list">{sessions.map((session) => <Link href={`/app/sessions/${session.id}`} className="recent-row" key={session.id}><div><strong>{session.track_name}</strong><p>{session.car_class} · {session.session_type} · {session.input_device}</p></div><div className="recent-stat"><span>Best</span><strong>{formatLapTime(session.metrics.pace.best_lap_ms)}</strong></div><div className="recent-stat"><span>Consistency</span><strong>{session.metrics.pace.consistency_score}</strong></div><div className="recent-stat"><span>Clean</span><strong>{session.metrics.pace.clean_laps}/{session.laps.length}</strong></div></Link>)}</div>
      </section>
      <section className="span-5 surface-card">
        <SectionHeading eyebrow="Current stint" title="Phase stability" />
        <div className="stint-rails"><SessionRail label="OPENING" value={`${latest.metrics.stint.phase_consistency.opening}`} detail="consistency / 100"/><SessionRail label="MIDDLE" value={`${latest.metrics.stint.phase_consistency.middle}`} detail="consistency / 100"/><SessionRail label="CLOSING" value={`${latest.metrics.stint.phase_consistency.closing}`} detail="consistency / 100" tone="loss"/></div>
        <div className="technical-list" style={{marginTop:14}}><div className="technical-row"><span>Pace degradation</span><strong>{pace.pace_degradation_ms_per_lap} ms/lap</strong></div><div className="technical-row"><span>Error frequency increasing</span><strong>{latest.metrics.stint.increasing_error_frequency ? "Yes" : "No"}</strong></div></div>
      </section>
      <section className="span-12 surface-card"><SectionHeading eyebrow="System readiness" title="Collector and analysis chain" /><div className="dashboard-grid"><div className="span-4"><div className="state-card"><RadioTower size={20}/><div><strong>Collector offline</strong><p>Expected in demo mode. Start the native Windows listener when the PS4 is ready.</p></div></div></div><div className="span-4"><MetricCard icon={Activity} label="Replay fixture" value="Ready" detail="same batch ingestion path" /></div><div className="span-4"><MetricCard icon={ShieldCheck} label="Schema compatibility" value="Matched" detail="schema 1 · adapter 0.1.0" /></div></div></section>
    </div>
  </>;
}
