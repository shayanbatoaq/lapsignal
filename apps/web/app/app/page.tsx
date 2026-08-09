import { Activity, Gauge, Gamepad2, Target, Timer, TrendingUp } from "lucide-react";
import Link from "next/link";
import { DemoBanner, MetricCard, SectionHeading } from "@/components/UI";
import { getSessions } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";

export default async function DashboardPage() {
  const sessions = await getSessions();
  const latest = sessions[0]!;
  const pace = latest.metrics.pace;
  return <>
    <DemoBanner />
    <div className="dashboard-grid">
      <div className="span-8 surface-card session-hero"><div className="session-meta"><span className="tag demo">Demo data</span><span className="tag">{latest.game_label}</span><span className="tag">{latest.input_device}</span></div><h2>{latest.track_name}<br />{latest.session_type}</h2><p>{latest.laps.length} laps · {pace.clean_laps} clean · analysis complete</p><div className="session-primary-time"><span>Best clean lap</span><strong>{formatLapTime(pace.best_lap_ms)}</strong></div></div>
      <div className="span-4 surface-card priority-panel"><div><p className="eyebrow">Current coaching priority</p><h2 className="priority-title">{latest.findings[0]?.title}</h2></div><p>{latest.findings[0]?.plain_language}</p><div><div className="metric-detail"><span>Evidence confidence</span><span style={{marginLeft:"auto",color:"var(--positive)"}}>{Math.round((latest.findings[0]?.confidence ?? 0)*100)}%</span></div><div className="progress-bar"><span style={{width:`${(latest.findings[0]?.confidence ?? 0)*100}%`}} /></div></div><Link className="button small" href="/app/coach">Open coach report</Link></div>
      <div className="span-3"><MetricCard icon={Target} label="Development score" value="78.4" trend="2.6 this month" detail="evidence-weighted" /></div>
      <div className="span-3"><MetricCard icon={Activity} label="Consistency" value={`${pace.consistency_score}`} detail="robust clean-lap score" /></div>
      <div className="span-3"><MetricCard icon={Timer} label="Sessions" value={`${sessions.length}`} detail="across 2 input contexts" /></div>
      <div className="span-3"><MetricCard icon={Gamepad2} label="Input context" value="Controller" detail="wheel data separated" /></div>
      <section className="span-7 surface-card flush"><div style={{padding:"18px 18px 8px"}}><SectionHeading eyebrow="Recent work" title="Session library" action={<Link className="button ghost small" href="/app/sessions">View all</Link>} /></div><div className="recent-list">{sessions.map((session) => <Link href={`/app/sessions/${session.id}`} className="recent-row" key={session.id}><div><strong>{session.track_name}</strong><p>{session.car_class} · {session.session_type} · {session.input_device}</p></div><div className="recent-stat"><span>Best</span><strong>{formatLapTime(session.metrics.pace.best_lap_ms)}</strong></div><div className="recent-stat"><span>Consistency</span><strong>{session.metrics.pace.consistency_score}</strong></div><div className="recent-stat"><span>Clean</span><strong>{session.metrics.pace.clean_laps}/{session.laps.length}</strong></div></Link>)}</div></section>
      <section className="span-5 surface-card"><SectionHeading eyebrow="Last 6 sessions" title="Improvement trend" /><div className="sparkline"><svg viewBox="0 0 420 90" preserveAspectRatio="none"><defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5EEBFF" stopOpacity=".22"/><stop offset="1" stopColor="#5EEBFF" stopOpacity="0"/></linearGradient></defs><path className="area" d="M0 78L0 65L70 61L140 67L210 44L280 49L350 25L420 18L420 78Z"/><path className="line" d="M0 65L70 61L140 67L210 44L280 49L350 25L420 18"/></svg></div><div className="technical-list"><div className="technical-row"><span>Median-lap direction</span><strong style={{color:"var(--positive)"}}>Improving</strong></div><div className="technical-row"><span>Controller sessions</span><strong>2</strong></div><div className="technical-row"><span>Wheel sessions</span><strong>1</strong></div></div></section>
      <section className="span-12 surface-card"><SectionHeading eyebrow="System" title="Collector readiness" /><div className="dashboard-grid"><div className="span-4"><div className="state-card"><Gauge size={20}/><div><strong>Collector offline</strong><p>Expected when exploring demo mode. Start native Windows listening when your PS4 is ready.</p></div></div></div><div className="span-4"><MetricCard icon={TrendingUp} label="Replay fixture" value="Ready" detail="same batch ingestion path" /></div><div className="span-4"><MetricCard icon={Activity} label="Schema compatibility" value="Matched" detail="schema 1 · adapter 0.1.0" /></div></div></section>
    </div>
  </>;
}
