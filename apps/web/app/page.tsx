import { ArrowRight, BrainCircuit, Cable, CheckCircle2, Gauge, Gamepad2, LineChart, ShieldCheck, TimerReset } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function MarketingPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav" aria-label="Marketing navigation">
        <Logo />
        <div className="marketing-links"><a href="#how-it-works">How it works</a><a href="#evidence">Evidence</a><a href="#endurance">Endurance</a><Link className="button small" href="/app">Try the live demo <ArrowRight size={14} /></Link></div>
      </nav>
      <main id="main-content" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Evidence-backed race engineering</p>
            <h1>Every lap <span>has a signal.</span></h1>
            <p className="hero-lede">LapSignal turns verified telemetry into a focused next-stint plan—showing what changed, where it happened, and how confident the evidence is.</p>
            <div className="hero-actions"><Link className="button" href="/app">Explore the seeded demo <ArrowRight size={17} /></Link><Link className="button secondary" href="/app/onboarding">Connect F1 2021</Link></div>
            <div className="hero-proof"><span><i /> Works without an AI key</span><span><i /> Controller and wheel aware</span><span><i /> Raw telemetry stays local</span></div>
          </div>
          <div className="hero-visual" aria-label="LapSignal product preview showing a telemetry trace and evidence-backed finding">
            <div className="signal-orbit" />
            <div className="product-preview">
              <div className="preview-head"><strong>Stint analysis · 12 laps</strong><span>● ANALYSIS COMPLETE</span></div>
              <div className="preview-metrics"><div><span>Best clean</span><strong>1:29.642</strong></div><div><span>Consistency</span><strong>97.8</strong></div><div><span>Long-run</span><strong>91.4</strong></div></div>
              <div className="animated-trace"><svg viewBox="0 0 560 170" preserveAspectRatio="none"><path className="trace-line" d="M0 46C34 42 48 43 68 61C88 79 101 143 124 133C149 122 148 53 177 48C207 44 211 82 240 88C271 94 277 34 309 45C344 56 343 139 375 133C407 126 397 69 428 61C465 51 474 92 503 82C529 72 533 38 560 35" /><path className="trace-line secondary" d="M0 52C31 48 51 51 68 67C87 85 100 150 124 139C148 128 151 60 177 54C206 48 216 91 240 96C269 102 280 40 309 51C341 63 348 145 375 139C405 132 402 77 428 68C463 58 477 101 503 90C530 78 538 44 560 42" /></svg></div>
              <div className="preview-finding"><span>Priority 01 · confidence 91%</span><strong>Stabilize the repeatable lap before adding pace.</strong></div>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="section-title"><p className="eyebrow">The feedback loop</p><h2>Three steps. One clearer stint.</h2><p>LapSignal separates collection, calculation, and coaching so every recommendation can be traced to recorded evidence.</p></div>
          <div className="steps-grid"><article className="step-card"><Cable size={24} /><h3>Connect</h3><p>Listen to F1 2021 UDP on Windows, replay a fixture, or open the credential-free seeded demo.</p></article><article className="step-card"><LineChart size={24} /><h3>Analyze</h3><p>Distance-align clean laps and calculate pace, braking, throttle, steering, tyre, and stint patterns.</p></article><article className="step-card"><BrainCircuit size={24} /><h3>Improve</h3><p>Receive no more than three priorities, each with confidence, exact evidence, and a next-stint exercise.</p></article></div>
        </section>

        <section className="evidence-section" id="evidence"><div className="section evidence-split">
          <div className="section-title"><p className="eyebrow">Trust the recommendation</p><h2>Coaching with its receipts attached.</h2><p>The analytics engine owns every calculation. AI can translate verified findings into plain language; it cannot invent a lap, a metric, or a guarantee.</p><div className="hero-proof"><span><ShieldCheck size={15} /> Deterministic source of truth</span><span><CheckCircle2 size={15} /> Finding IDs on every claim</span></div></div>
          <div className="evidence-list"><div className="evidence-row"><span className="index">01</span><div><strong>Brake onset variation · Zone 4</strong><p>118.4 m vs 108.7 m on the best comparable clean lap</p></div><span className="confidence"><b style={{color:"var(--positive)"}}>●</b> 86%</span></div><div className="evidence-row"><span className="index">02</span><div><strong>Throttle pickup · Zone 2 exit</strong><p>Progressive application begins 6.2 m later</p></div><span className="confidence"><b style={{color:"var(--warning)"}}>◆</b> 78%</span></div><div className="evidence-row"><span className="index">03</span><div><strong>Closing-stint stability</strong><p>Descriptive trend only · no medical conclusion</p></div><span className="confidence"><b style={{color:"var(--positive)"}}>●</b> 89%</span></div></div>
        </div></section>

        <section className="section" id="endurance"><div className="endurance-banner"><div><p className="eyebrow">Built beyond the hot lap</p><h2>Develop the driver you are on lap twenty.</h2><p>Track pace degradation, input consistency, tyre correlation, fuel context, error frequency, and stability through each stint phase. Controller and wheel sessions remain separate by default.</p><div className="hero-actions"><Link className="button secondary" href="/app/progress">See driver development <ArrowRight size={16} /></Link></div></div><div className="endurance-matrix"><div><TimerReset size={17} /><strong>3 phases</strong><span>Opening · middle · closing</span></div><div><Gauge size={17} /><strong>6 signals</strong><span>Pace · inputs · fuel · tyres · traffic · stability</span></div><div><Gamepad2 size={17} /><strong>2 contexts</strong><span>Controller and wheel aware</span></div><div><ShieldCheck size={17} /><strong>1 source</strong><span>Verified deterministic analysis</span></div></div></div></section>
      </main>
      <footer className="marketing-footer"><Logo /><p>LapSignal is an independent telemetry analysis prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.</p></footer>
    </div>
  );
}
