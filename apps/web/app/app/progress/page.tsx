import { Archive, Gamepad2, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { MetricCard, SectionHeading, SessionRail, StateCard } from "@/components/UI";
import { getSessionsResult } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";

export default async function ProgressPage() {
  const result = await getSessionsResult();
  if (result.status !== "ok") return <section className="surface-card empty-stage"><StateCard type="warning" title="Progress unavailable">The local API could not load saved history. Start the API and refresh this page.</StateCard></section>;
  const sessions = result.sessions;
  const totalLaps = sessions.reduce((sum, session) => sum + session.laps.length, 0);
  const cleanLaps = sessions.reduce((sum, session) => sum + session.metrics.pace.clean_laps, 0);
  const inputContexts = new Set(sessions.map((session) => session.input_device)).size;
  const contexts = new Map<string, number>();
  sessions.forEach((session)=>{const key=`${session.track_id}:${session.car_id}:${session.input_device}`;contexts.set(key,(contexts.get(key)??0)+1)});
  const hasComparableHistory = [...contexts.values()].some((count)=>count>=2);

  return <>
    <div className="session-detail-head"><div><p className="eyebrow">Development register</p><h2>Driver evidence archive</h2><p>Each track, car class, and input device remains its own comparison context.</p></div><Link className="button secondary small" href="/app/sessions"><Archive size={14}/> Open session register</Link></div>
    <div className="dashboard-grid">
      <div className="span-3"><MetricCard icon={Archive} label="Stored sessions" value={`${sessions.length}`} detail="recorded locally"/></div>
      <div className="span-3"><MetricCard icon={Timer} label="Recorded laps" value={`${totalLaps}`} detail={`${cleanLaps} classified clean`}/></div>
      <div className="span-3"><MetricCard icon={Gamepad2} label="Input contexts" value={`${inputContexts}`} detail="controller and wheel"/></div>
      <div className="span-3"><MetricCard icon={ShieldCheck} label="Evidence chain" value="Matched" detail="stored provenance on every run"/></div>
      {sessions.length===0?<section className="span-12 surface-card empty-stage"><StateCard title="Establish your first baseline">Record and finalize a session with at least one clean lap. Progress appears only after comparable real sessions exist.</StateCard><Link className="button" href="/app/live">Open Live Session</Link></section>:<><section className="span-8 surface-card flush"><div style={{padding:"18px 18px 8px"}}><SectionHeading eyebrow="Context-separated" title="Recorded run board"/></div><div className="recent-list">{sessions.map((session)=><Link href={`/app/sessions/${session.id}`} className="recent-row" key={session.id}><div><strong>{session.track_name}</strong><p>{session.game_label} · {session.car_class} · {session.input_device}</p></div><div className="recent-stat"><span>Best</span><strong>{formatLapTime(session.metrics.pace.best_lap_ms)}</strong></div><div className="recent-stat"><span>Consistency</span><strong>{session.metrics.pace.consistency_score}</strong></div><div className="recent-stat"><span>Stability</span><strong>{session.metrics.stint.long_run_stability_score}</strong></div></Link>)}</div></section><section className="span-4 surface-card"><SectionHeading eyebrow="Comparison rule" title="Like for like only"/><StateCard title={hasComparableHistory?"Comparable history available":"Build a comparable baseline"}>{hasComparableHistory?"LapSignal found at least two sessions with the same track, car, and input context.":"Record another session on the same track with the same car and input before LapSignal reports a trend."}</StateCard><div className="technical-list" style={{marginTop:16}}><div className="technical-row"><span>Controller sessions</span><strong>{sessions.filter((session)=>session.input_device==="controller").length}</strong></div><div className="technical-row"><span>Wheel sessions</span><strong>{sessions.filter((session)=>session.input_device==="wheel").length}</strong></div><div className="technical-row"><span>Unknown input</span><strong>{sessions.filter((session)=>session.input_device==="unknown").length}</strong></div></div></section>{hasComparableHistory&&sessions.map((session)=><section className="span-4 surface-card" key={session.id}><SectionHeading eyebrow={`${session.car_class} · ${session.input_device}`} title={session.track_name}/><div className="stint-rails"><SessionRail label="OPENING" value={`${session.metrics.stint.phase_consistency.opening}`} detail="consistency"/><SessionRail label="MIDDLE" value={`${session.metrics.stint.phase_consistency.middle}`} detail="consistency"/><SessionRail label="CLOSING" value={`${session.metrics.stint.phase_consistency.closing}`} detail="consistency" tone="loss"/></div><div className="technical-list" style={{marginTop:12}}><div className="technical-row"><span>Clean laps</span><strong>{session.metrics.pace.clean_laps}/{session.laps.length}</strong></div><div className="technical-row"><span>Pace degradation</span><strong>{session.metrics.pace.pace_degradation_ms_per_lap??"Unavailable"}</strong></div></div></section>)}</>}
    </div>
  </>;
}
