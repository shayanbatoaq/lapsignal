"use client";

import { Gauge, Layers3, RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { TelemetryChart } from "@/components/TelemetryChart";
import { MetricCard, SectionHeading } from "@/components/UI";
import type { Session, TelemetryTrace } from "@/lib/types";
import { formatLapTime } from "@lapsignal/telemetry-domain";

export function CompareWorkspace({ session, traces, labels = {} }: { session: Session; traces: TelemetryTrace[]; labels?: Record<number, string> }) {
  const comparable = traces.filter((trace) => trace.valid && trace.lap_time_ms != null);
  const [selected, setSelected] = useState<number[]>(comparable.slice(0, 2).map((trace) => trace.lap_number));
  const active = useMemo(() => comparable.filter((trace) => selected.includes(trace.lap_number)), [comparable, selected]);
  const toggle = (lap: number) => setSelected((current) => current.includes(lap) ? current.length > 2 ? current.filter((item) => item !== lap) : current : current.length < 4 ? [...current, lap] : current);
  const best = Math.min(...active.map((trace) => trace.lap_time_ms ?? Infinity));
  const slowest = Math.max(...active.map((trace) => trace.lap_time_ms ?? -Infinity));
  const name = (trace: TelemetryTrace) => labels[trace.lap_number] ?? `Lap ${trace.lap_number}`;
  return <>
    <div className="session-detail-head"><div><p className="eyebrow">Measured telemetry comparison</p><h2>{session.track_name}</h2><p>{Object.keys(labels).length ? "A slower baseline lap is aligned against the improved Practice 03 lap using representative distance-based telemetry." : "Select two to four clean laps. Invalid attempts remain coachable but are excluded from this official timing comparison."}</p></div><div className="detail-actions"><button className="button secondary small" onClick={() => setSelected(comparable.slice(0, 2).map((trace) => trace.lap_number))}><RotateCcw size={14}/> Reset</button><button className="button small" onClick={() => setSelected([...comparable].sort((a, b) => (a.lap_time_ms ?? Infinity) - (b.lap_time_ms ?? Infinity)).slice(0, 2).map((trace) => trace.lap_number))}><Gauge size={14}/> Fastest pair</button></div></div>
    <section className="surface-card" style={{ marginBottom: 16 }}><SectionHeading eyebrow="Clean laps" title={`${selected.length} laps selected`}/><div className="channel-toggles">{comparable.map((trace) => <button className={selected.includes(trace.lap_number) ? "active" : ""} aria-pressed={selected.includes(trace.lap_number)} onClick={() => toggle(trace.lap_number)} key={`${name(trace)}-${trace.lap_number}`}><span className="channel-shape"/>{name(trace)} · {formatLapTime(trace.lap_time_ms)}</button>)}</div></section>
    <div className="dashboard-grid" style={{ marginBottom: 16 }}><div className="span-4"><MetricCard icon={Layers3} label="Compared spread" value={Number.isFinite(slowest - best) ? `${((slowest - best) / 1000).toFixed(3)} s` : "—"} detail="deterministic finish-line delta"/></div><div className="span-4"><MetricCard icon={ShieldCheck} label="Reference lap" value={Number.isFinite(best) ? name(active.find((trace) => trace.lap_time_ms === best)!) : "No clean lap"} detail={formatLapTime(Number.isFinite(best) ? best : null)}/></div><div className="span-4"><MetricCard icon={Gauge} label="Theoretical best" value={formatLapTime(session.metrics.pace.theoretical_best_ms)} detail="best stored sectors"/></div></div>
    <TelemetryChart traces={active}/>
    <section className="surface-card" style={{ marginTop: 16 }}><SectionHeading eyebrow="Evidence contract" title="How this comparison is built"/><div className="technical-list"><div className="technical-row"><span>Largest finish-line delta</span><strong>{Number.isFinite(slowest - best) ? `${((slowest - best) / 1000).toFixed(3)} s` : "Unavailable"}</strong></div><div className="technical-row"><span>Alignment basis</span><strong>Lap distance (m)</strong></div><div className="technical-row"><span>Source quality</span><strong style={{ color: "var(--positive)" }}>{Object.keys(labels).length ? "Representative · clean laps only" : "Recorded · clean laps only"}</strong></div></div></section>
  </>;
}
