"use client";

import { Activity, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TrackMap } from "@/components/TrackMap";
import { showcaseCircuitMap, showcasePlaybackSamples } from "@/lib/showcase-playback";

export function ShowcasePlayback() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const current = showcasePlaybackSamples[index]!;
  useEffect(() => {
    const visibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", visibility);
    if (!playing) return () => document.removeEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => setIndex((value) => value >= showcasePlaybackSamples.length - 1 ? 0 : value + 1), 140 / speed);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [playing, speed]);
  const speedTrace = useMemo(() => showcasePlaybackSamples.slice(Math.max(0, index - 70), index + 1).map((sample, point) => `${(point / Math.max(1, Math.min(70, index))) * 100},${86 - sample.speed_kph / 4}`).join(" "), [index]);
  return <div className="live-layout">
    <div className="surface-card">
      <div className="live-identity"><p className="eyebrow">RECORDED SHOWCASE PLAYBACK</p><h2>SPA-FRANCORCHAMPS / TIME TRIAL / LAP 7</h2><p>APEX DYNAMICS / MODERN OPEN WHEEL / REPRESENTATIVE DATA</p></div>
      <div className="live-map-grid"><TrackMap circuitMap={showcaseCircuitMap} sample={current} trackName="Spa-Francorchamps" online/><div className="car-context"><span className="car-silhouette" aria-hidden="true">◢▰◣</span><strong>Apex Dynamics</strong><span>Car 27 · Modern open wheel</span><span>Clear · 7003 m</span></div></div>
      <div className="performance-prompt playback-controls"><strong>Representative Spa telemetry</strong><div><button aria-label={playing ? "Pause playback" : "Play playback"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>} {playing ? "Pause" : "Play"}</button><button aria-label="Restart playback" onClick={() => { setIndex(0); setPlaying(false); }}><RotateCcw size={14}/> Restart</button><button aria-label="Toggle playback speed" onClick={() => setSpeed((value) => value === 1 ? 2 : 1)}>{speed}×</button></div><small>Deterministic recorded visualization · no collector or live connection</small></div>
      <div className="live-readout"><Readout label="Lap progress" value={`${Math.round((current.lap_distance_m / 7003) * 100)}%`}/><Readout label="Lap time" value={`${(current.current_lap_time_ms / 1000).toFixed(3)}s`}/><Readout label="Speed" value={`${current.speed_kph} km/h`}/><Readout label="Gear" value={String(current.gear)}/><Readout label="RPM" value={String(current.rpm)}/><Readout label="Throttle" value={`${Math.round(current.throttle_0_1 * 100)}%`}/><Readout label="Brake" value={`${Math.round(current.brake_0_1 * 100)}%`}/><Readout label="Steering" value={current.steer_minus1_1.toFixed(2)}/></div>
      <div className="animated-trace" style={{ marginTop: 16 }}><svg viewBox="0 0 100 90" preserveAspectRatio="none"><polyline className="trace-line" points={speedTrace || "0,80 100,80"}/></svg></div>
    </div>
    <aside className="coach-side"><div className="surface-card"><div className="section-heading"><div><p className="eyebrow">Playback status</p><h2>{playing ? "Visualization running" : "Visualization paused"}</h2></div><Activity size={18} color="var(--blue)"/></div><div className="technical-list"><Technical label="Source" value="Bundled representative fixture"/><Technical label="Physical collector" value="Not connected"/><Technical label="Network activity" value="None"/><Technical label="Playback speed" value={`${speed}×`}/><Technical label="Map positioning" value="Lap-distance projected"/></div></div><div className="surface-card"><div className="section-heading"><div><p className="eyebrow">Read-only</p><h2>No telemetry captured</h2></div><ShieldCheck size={18}/></div><p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>The public preview never opens a UDP collector, WebSocket, database, or cloud-model connection. Physical collection is available in the local application.</p></div></aside>
  </div>;
}

function Readout({ label, value }: { label: string; value: string }) { return <div className="readout"><span>{label}</span><strong>{value}</strong></div>; }
function Technical({ label, value }: { label: string; value: string }) { return <div className="technical-row"><span>{label}</span><strong>{value}</strong></div>; }
