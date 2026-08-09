import { Activity, ArrowRight, Check, CircleDot, ClipboardCheck, Database, Gamepad2, RadioTower, ScanLine, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Confidence, DeltaBadge, SessionRail, SignalDivider } from "@/components/UI";
import { getSessions } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";

export default async function MarketingPage() {
  const sessions = await getSessions();
  const session = sessions.find((item) => item.id === "f1-controller-silverstone") ?? sessions[0]!;
  const pace = session.metrics.pace;
  const bestLap = session.laps.find((lap) => lap.valid && lap.lap_time_ms === pace.best_lap_ms) ?? session.laps.find((lap) => lap.valid)!;
  const bestSectors = bestLap.sector_times_ms.map((_, index) => Math.min(...session.laps.filter((lap) => lap.valid).map((lap) => lap.sector_times_ms[index]!)));
  const sectorLoss = bestLap.sector_times_ms.map((value, index) => value - bestSectors[index]!);
  const available = pace.best_lap_ms - pace.theoretical_best_ms;
  const minLap = Math.min(...session.laps.map((lap) => lap.lap_time_ms));
  const maxLap = Math.max(...session.laps.map((lap) => lap.lap_time_ms));
  const stintPoints = session.laps.map((lap, index) => `${index * (680 / Math.max(1, session.laps.length - 1))},${155 - ((lap.lap_time_ms - minLap) / Math.max(1, maxLap - minLap)) * 105}`).join(" ");
  const finding = session.findings[0]!;

  return (
    <div className="marketing">
      <nav className="marketing-nav" aria-label="Marketing navigation">
        <Logo />
        <div className="marketing-links"><a href="#debrief">Debrief</a><a href="#workflow">Workflow</a><a href="#compatibility">Compatibility</a><Link className="button small" href="/app">Open seeded run <ArrowRight size={14} /></Link></div>
      </nav>
      <main id="main-content" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-session-code"><span>RUN 01</span><i /> SILVERSTONE · POST-STINT</div>
            <p className="eyebrow">Race engineering after the chequered flag</p>
            <h1>Find the time.<br/><span>Plan the next run.</span></h1>
            <p className="hero-lede">LapSignal turns recorded telemetry into a focused engineering debrief: where the lap moved, what held up across the stint, and the one job to take back on track.</p>
            <div className="hero-actions"><Link className="button" href="/app">Open the seeded debrief <ArrowRight size={17} /></Link><a className="button secondary" href="#debrief">Inspect the evidence</a></div>
            <div className="hero-proof"><span><i /> Local-first telemetry</span><span><i /> Deterministic findings</span><span><i /> Device-aware context</span></div>
          </div>
          <div className="hero-visual" aria-label={`Seeded ${session.track_name} post-stint debrief`}>
            <div className="product-preview pitwall-preview">
              <div className="preview-head"><div><span className="status-lamp"/><strong>{session.track_name.toUpperCase()}</strong><small>{session.game_label} · {session.session_type}</small></div><span>ANALYSIS COMPLETE</span></div>
              <div className="preview-timing"><div><span>BEST CLEAN</span><strong>{formatLapTime(pace.best_lap_ms)}</strong><small>LAP {bestLap.lap_number}</small></div><DeltaBadge value={`+${(available / 1000).toFixed(3)}`} label="to theoretical" /></div>
              <div className="sector-board">{sectorLoss.map((loss, index) => <SessionRail key={index} label={`S${index + 1}`} value={loss ? `+${(loss / 1000).toFixed(3)}` : "REF"} detail={formatLapTime(bestLap.sector_times_ms[index])} tone={loss > 100 ? "loss" : loss === 0 ? "positive" : "neutral"} />)}</div>
              <div className="preview-finding"><div><span>RUN PLAN · P{finding.priority}</span><Confidence value={finding.confidence}/></div><strong>{finding.title}</strong><p>{finding.recommended_action}</p></div>
              <div className="preview-footer"><span>{pace.clean_laps}/{session.laps.length} clean laps</span><span>{pace.consistency_score} consistency</span><span>{session.input_device} context</span></div>
            </div>
          </div>
        </section>

        <SignalDivider label="DEBRIEF / 01" />
        <section className="section debrief-section" id="debrief">
          <div className="section-title"><p className="eyebrow">Where the lap went</p><h2>A timing sheet that explains itself.</h2><p>The best clean lap leaves {available} ms against the stored best sectors. LapSignal keeps the loss attached to the evidence instead of hiding it behind a score.</p></div>
          <div className="debrief-grid">
            <article className="timing-board"><header><span>BEST LAP · {bestLap.lap_number}</span><strong>{formatLapTime(pace.best_lap_ms)}</strong></header>{sectorLoss.map((loss, index) => <div className="timing-row" key={index}><span>S{index + 1}</span><div><i style={{width: `${Math.max(5, (loss / Math.max(...sectorLoss)) * 100)}%`}}/></div><strong className={loss > 100 ? "loss" : ""}>{loss ? `+${loss} ms` : "reference"}</strong><small>{formatLapTime(bestLap.sector_times_ms[index])}</small></div>)}<footer><span>THEORETICAL</span><strong>{formatLapTime(pace.theoretical_best_ms)}</strong></footer></article>
            <article className="engineering-note"><div className="note-index">01</div><p className="eyebrow">Highest-confidence signal</p><h3>{finding.title}</h3><p>{finding.plain_language}</p><div className="note-evidence"><ShieldCheck size={18}/><div><span>Stored evidence</span><strong>{pace.consistency_score}/100 · {Math.round(finding.confidence * 100)}% confidence</strong></div></div><div className="action-strip"><span>Call for the next run</span><strong>{finding.recommended_action}</strong></div></article>
          </div>
        </section>

        <section className="stint-section"><div className="section stint-grid">
          <div className="stint-copy"><p className="eyebrow">Across the stint</p><h2>One fast lap is not the whole run.</h2><p>{session.report.session_summary} The phase view stays descriptive and never pretends a synthetic fixture measured more than it did.</p><div className="stint-rails"><SessionRail label="OPENING" value={`${session.metrics.stint.phase_consistency.opening}`} detail="consistency / 100"/><SessionRail label="MIDDLE" value={`${session.metrics.stint.phase_consistency.middle}`} detail="consistency / 100"/><SessionRail label="CLOSING" value={`${session.metrics.stint.phase_consistency.closing}`} detail="consistency / 100" tone="loss"/></div></div>
          <div className="stint-chart"><header><span>LAP TIME TRACE</span><strong>{session.laps.length} LAPS</strong></header><svg viewBox="0 0 680 185" preserveAspectRatio="none" role="img" aria-label="Seeded lap-time trace across the Silverstone stint">{[35,75,115,155].map((y) => <line key={y} x1="0" x2="680" y1={y} y2={y}/>) }<polyline points={stintPoints}/>{session.laps.map((lap,index)=><circle key={lap.id} className={lap.valid?"":"invalid"} cx={index*(680/Math.max(1,session.laps.length-1))} cy={155-((lap.lap_time_ms-minLap)/Math.max(1,maxLap-minLap))*105} r="4"/> )}</svg><footer><span>LAP 01</span><span>INVALID / ANOMALOUS MARKED</span><span>LAP {session.laps.length}</span></footer></div>
        </div></section>

        <section className="section next-run-section"><div className="run-plan"><div><p className="eyebrow">Next-run plan</p><h2>Five laps. One controlled variable.</h2><p>{session.report.next_stint_plan}</p><Link className="button" href="/app/coach">Open full debrief <ArrowRight size={16}/></Link></div><ol><li><span>01</span>Hold a controlled pace</li><li><span>02</span>Repeat initial brake markers</li><li><span>03</span>Release progressively</li><li><span>04</span>Review after the stint</li></ol></div></section>

        <section className="hardware-section"><div className="section hardware-grid"><div><p className="eyebrow">Hardware-aware by default</p><h2>Controller and wheel are separate engineering contexts.</h2><p>The seeded run is tagged <strong>{session.input_device}</strong>. Smoothing expectations, correction language, and comparisons keep that context attached.</p></div><div className="hardware-panel"><Gamepad2 size={30}/><div><span>ACTIVE INPUT</span><strong>CONTROLLER</strong><small>Silverstone · {session.laps.length} recorded laps</small></div><i/><div><span>OTHER CONTEXT</span><strong>WHEEL</strong><small>Stored separately · Ardenne fixture</small></div></div></div></section>

        <section className="section" id="workflow"><div className="section-title"><p className="eyebrow">The engineering loop</p><h2>From packet to pit-wall call.</h2><p>Four explicit stages keep collection, calculation, evidence, and coaching accountable.</p></div><div className="steps-grid four"><article className="step-card"><RadioTower/><span>01 / CAPTURE</span><h3>Record</h3><p>Listen to supported F1 2021 UDP or run the deterministic replay.</p></article><article className="step-card"><ScanLine/><span>02 / ALIGN</span><h3>Compare</h3><p>Normalize clean laps by distance and preserve validity classifications.</p></article><article className="step-card"><Database/><span>03 / VERIFY</span><h3>Calculate</h3><p>Produce stored pace, input, stint, and provenance evidence.</p></article><article className="step-card"><ClipboardCheck/><span>04 / CALL</span><h3>Debrief</h3><p>Translate supported findings into one focused next-run exercise.</p></article></div></section>

        <section className="section compatibility" id="compatibility"><div className="section-title"><p className="eyebrow">Compatibility board</p><h2>Clear status. No implied integrations.</h2></div><div className="compat-board"><Compatibility title="Available" tone="positive" icon={Check} items={["Seeded local demo","F1 2021 Windows UDP collector","Fixture replay through ingestion API","Controller and wheel contexts"]}/><Compatibility title="Experimental" tone="warning" icon={Wrench} items={["Synthetic GT3 practice fixture","Synthetic hypercar endurance fixture","Optional consent-gated cloud explanation"]}/><Compatibility title="Planned" tone="muted" icon={CircleDot} items={["Newer game adapters","Durable live-session finalization","Richer measured traffic and energy analysis"]}/></div></section>

        <section className="section final-cta"><div><Activity/><p className="eyebrow">Pit wall ready</p><h2>Open the run. Read the signal. Go again.</h2><p>Start with the reproducible Silverstone debrief—no hardware, cloud key, or live connection required.</p><div className="hero-actions"><Link className="button" href="/app">Open LapSignal <ArrowRight size={17}/></Link><Link className="button secondary" href="/app/onboarding">Set up F1 2021</Link></div></div></section>
      </main>
      <footer className="marketing-footer"><Logo /><div><span>LOCAL-FIRST TELEMETRY ENGINEERING</span><p>LapSignal is an independent telemetry analysis prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.</p></div></footer>
    </div>
  );
}

function Compatibility({ title, tone, icon: Icon, items }: { title: string; tone: string; icon: LucideIcon; items: string[] }) {
  return <article className={`compat-column ${tone}`}><header><Icon size={17}/><strong>{title}</strong></header><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul></article>;
}
