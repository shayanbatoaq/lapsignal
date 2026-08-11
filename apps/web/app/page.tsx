import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Gamepad2, RadioTower, ScanLine } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getSessions } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";
import styles from "./landing.module.css";

const TRACKS = {
  spa: {
    name: "Circuit de Spa-Francorchamps",
    shortName: "SPA-FRANCORCHAMPS",
    path: "M109.2 271.9 L39.5 318 L33.9 321.2 L28 321.1 L28.1 315 L54 263.3 L107.5 207.9 L117.8 191.6 L128.2 184.3 L146.7 179.2 L152.2 175.8 L193.4 145.1 L209.8 135 L360 77.7 L372.4 74.5 L378.4 76.4 L387.4 85.4 L393.6 86.7 L411.6 79.8 L417.9 78.6 L424.1 80 L466.8 127.9 L472 139.4 L469.5 145.2 L464.2 148.6 L457.8 148.9 L452.4 145.6 L432.1 120.7 L425.9 119.4 L396 131 L322.3 153.1 L314.1 162.7 L312.7 175.4 L313.9 188.2 L318.6 200 L334.1 211.3 L401.9 231.2 L412.5 238.1 L414.9 244 L410 262.5 L411.6 274.9 L421.6 282.8 L450.5 296.9 L459.9 305.3 L461.2 311.5 L459 317.5 L448.4 333.7 L439.6 342.9 L433.6 345.2 L420.8 344.7 L402.3 339.3 L385.3 330.3 L356.5 304.8 L330.8 268 L318.1 253.5 L295.4 241.5 L270.9 233.8 L258.3 231.5 L245.6 233.2 L199.5 255.7 L143 268.3 L137.8 265.6 L138.6 259.3 L135.5 254.2 L129.7 256.4 Z",
    start: [109.2, 271.9],
    marker: [372.4, 74.5],
  },
  "red-bull-ring": {
    name: "Red Bull Ring",
    shortName: "RED BULL RING",
    path: "M432.8 297.6 L220 351 L207.6 351.8 L194.3 329.7 L160.1 282.8 L95.8 156.3 L32.2 83.3 L28.2 78.3 L28 72.2 L33.5 69.2 L91.6 67.5 L193.1 86.1 L231.6 90 L302.4 95.9 L308.5 97.6 L313.1 102.1 L314.1 108.3 L308.5 119.8 L295.7 134.2 L279.6 145 L267.6 149.5 L254.9 151.8 L242 151.6 L178.4 141.4 L165.8 143.7 L155.5 151.3 L149.2 162.5 L148.8 175.2 L178.2 232.5 L182.5 237.2 L194 242.9 L200.4 243.7 L212.9 240.8 L245.2 209.6 L256.7 203.8 L269.1 200.4 L443.3 200.8 L454.1 207.4 L457.2 213 L472 269.2 L471.4 275.5 L467.6 280.6 Z",
    start: [432.8, 297.6],
    marker: [40.7, 93.1],
  },
  monza: {
    name: "Autodromo Nazionale Monza",
    shortName: "MONZA",
    path: "M321.4 315.5 L203.3 317.5 L198.8 316.8 L195.3 309 L163.7 318.3 L135.4 318.7 L116.8 316.1 L96.7 304 L87.2 293.5 L78.9 276.5 L72 249.1 L61.3 188.7 L53.4 184.4 L51.3 180.2 L29.8 133 L28.7 119.1 L39 109.9 L85.4 101.1 L89.9 101.9 L126 151.4 L150.9 179.7 L231.4 252.5 L250.1 251.3 L265.9 261 L275.2 262.1 L454.7 262.3 L463.9 264.3 L467.7 267 L471.6 275.5 L471.5 284.8 L467.2 293.1 L456.6 302.5 L443.7 308.2 L396.9 314 Z",
    start: [321.4, 315.5],
    marker: [42, 158.5],
  },
} as const;

type TrackKey = keyof typeof TRACKS;

export default async function MarketingPage() {
  const sessions = await getSessions();
  const session = sessions.find((item) => item.id === "f1-controller-silverstone") ?? sessions[0]!;
  const pace = session.metrics.pace;
  const bestLap = session.laps.find((lap) => lap.valid && lap.lap_time_ms === pace.best_lap_ms) ?? session.laps.find((lap) => lap.valid)!;
  const available = (pace.best_lap_ms ?? 0) - (pace.theoretical_best_ms ?? 0);
  const finding = session.findings[0]!;
  const cleanLaps = `${pace.clean_laps}/${session.laps.length}`;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Marketing navigation">
          <Logo variant="dark" size={172} priority />
          <div className={styles.navLinks}>
            <a href="#decoded">Debrief</a>
            <a href="#workflow">How it works</a>
            <a href="#setup">Your setup</a>
            <Link className={`button small ${styles.navCta}`} href="/app">Analyze a lap <ArrowRight size={14} /></Link>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} data-landing-main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AI RACE ENGINEER FOR SIM RACERS</p>
            <h1 id="hero-title">Every lap has <span>a signal.</span></h1>
            <p className={styles.heroLede}>Turn braking, throttle and steering telemetry into a faster next lap.</p>
          </div>

          <div className={styles.heroMedia}>
            <Image src="/media/hero-rig.webp" alt="Driver using an unbranded home sim-racing rig" fill priority sizes="(max-width: 760px) 100vw, 58vw" />
            <div className={styles.mediaShade} />
            <div className={`${styles.signalCard} ${styles.carbon}`} aria-label="Seeded telemetry recommendation">
              <div className={styles.signalHead}><span><i /> ACTIVE CORNER</span><strong>C06 · HEAVY BRAKE</strong></div>
              <div className={styles.recommendation}>
                <small>ENGINEER CALL · P{finding.priority}</small>
                <strong>{finding.title}</strong>
                <p>{finding.recommended_action}</p>
              </div>
              <div className={styles.signalStats}>
                <Metric label="DELTA" value={`+${(available / 1000).toFixed(3)}`} tone="loss" />
                <Metric label="CONFIDENCE" value={`${Math.round(finding.confidence * 100)}%`} tone="positive" />
                <Metric label="BEST CLEAN" value={formatLapTime(pace.best_lap_ms)} />
              </div>
              <TracePair />
            </div>
            <Circuit className={styles.heroCircuit} track="spa" />
          </div>

          <div className={styles.heroActions}>
            <Link className="button" href="/app">Analyze a demo lap <ArrowRight size={17} /></Link>
            <a className="button secondary" href="#decoded">See the debrief</a>
          </div>

          <div className={styles.compatibility} aria-label="Demo compatibility">
            <span>F1 2021</span><i /> <span>PS4 UDP</span><i /> <span>20 HZ</span><i /> <span>CONTROLLER READY</span>
          </div>
        </section>

        <section className={styles.decoded} id="decoded" aria-labelledby="decoded-title">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>01 · CORNER INTELLIGENCE</p>
            <h2 id="decoded-title">Your lap, <span>decoded.</span></h2>
            <p>See the corner. Find the loss. Know what to change. Every claim stays traceable.</p>
            <Link href="/app/sessions/f1-controller-silverstone">Inspect every evidence ID <ArrowRight size={15} /></Link>
          </div>

          <div className={`${styles.analysisFrame} ${styles.carbon}`}>
            <header><span>SEEDED RUN · {session.track_name.toUpperCase()}</span><strong><i /> ANALYSIS COMPLETE</strong></header>
            <div className={styles.analysisBody}>
              <figure className={styles.circuitPanel}>
                <Circuit className={styles.analysisCircuit} track="monza" />
                <figcaption>Monza reference outline · Silverstone values remain separate</figcaption>
                <div className={styles.cornerFlag}><span>REFERENCE TRACK</span><strong>MONZA</strong><small>RECOGNIZABLE OUTLINE</small></div>
              </figure>
              <div className={styles.analysisData}>
                <div className={styles.lapReadout}><span>BEST CLEAN · LAP {bestLap.lap_number}</span><strong>{formatLapTime(pace.best_lap_ms)}</strong><small>{cleanLaps} clean laps · {pace.consistency_score} consistency</small></div>
                <TracePair detailed />
                <div className={styles.engineerCall}><span>RECOMMENDATION</span><strong>{finding.title}</strong><p>{finding.recommended_action}</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.workflow} id="workflow" aria-labelledby="workflow-title">
          <div className={styles.workflowImage}>
            <Image src="/media/workflow-wheel.webp" alt="Hands driving with an unbranded sim-racing wheel and pedals" fill loading="eager" sizes="(max-width: 760px) 100vw, 46vw" />
            <span>INPUT / CAPTURE</span>
          </div>
          <div className={styles.workflowCopy}>
            <p className={styles.eyebrow}>02 · THE ENGINEERING LOOP</p>
            <h2 id="workflow-title">Drive. Debrief. <span>Improve.</span></h2>
            <p>LapSignal keeps the loop short: record the stint, separate clean evidence from noise, review the clearest loss, then return with one controlled change.</p>
            <ol className={styles.workflowSteps}>
              <WorkflowStep index="01" title="Drive" text="Run a focused stint in F1 2021." icon={<RadioTower size={17} />} />
              <WorkflowStep index="02" title="Capture" text="Collect local UDP telemetry at 20 Hz." icon={<ScanLine size={17} />} />
              <WorkflowStep index="03" title="Review" text="Compare the lap to stored evidence." icon={<Check size={17} />} />
              <WorkflowStep index="04" title="Return" text="Take one precise call back on track." icon={<ArrowRight size={17} />} />
            </ol>
          </div>
          <Circuit className={styles.workflowCircuit} track="red-bull-ring" />
        </section>

        <section className={styles.setup} id="setup" aria-labelledby="setup-title">
          <div className={styles.setupCopy}>
            <p className={styles.eyebrow}>03 · EQUIPMENT-AWARE</p>
            <h2 id="setup-title">Built for the rig <span>you have.</span></h2>
            <p className={styles.setupPromise}>Controller today. Wheel tomorrow. The coaching starts now.</p>
            <p>Input context stays attached to the evidence, so smoothing expectations and coaching language match the device used for the run.</p>
            <div className={styles.deviceChips}><span className={styles.activeChip}><Gamepad2 size={16} /> Controller context</span><span>Wheel context</span></div>
          </div>
          <div className={styles.setupVisual}>
            <Image src="/media/setup-hardware.webp" alt="Unbranded controller beside a compact sim-racing wheel and pedal setup" fill loading="eager" sizes="(max-width: 760px) 100vw, 52vw" />
            <div className={`${styles.profileCard} ${styles.carbon}`}><span>ACTIVE PROFILE</span><strong>CONTROLLER</strong><small>{session.track_name} · {session.laps.length} recorded laps</small><i /></div>
          </div>
        </section>

        <section className={`${styles.finalCta} ${styles.carbon}`} aria-labelledby="cta-title">
          <Circuit className={styles.ctaCircuit} track="red-bull-ring" />
          <div>
            <p className={styles.eyebrow}>READY FOR THE NEXT RUN</p>
            <h2 id="cta-title">Your next lap <span>starts here.</span></h2>
            <p>Open the reproducible Silverstone demo. Read the signal, take the call, and go again.</p>
            <Link className="button" href="/app">Analyze a demo lap <ArrowRight size={17} /></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Logo variant="dark" size={148} />
        <p>Local-first telemetry engineering. LapSignal is an independent prototype and is not affiliated with or endorsed by any game publisher, racing series, governing body, console manufacturer, or vehicle manufacturer.</p>
        <span>© 2026 LAPSIGNAL</span>
      </footer>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "loss" | "positive" }) {
  return <div className={tone ? styles[tone] : undefined}><span>{label}</span><strong>{value}</strong></div>;
}

function TracePair({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className={`${styles.traces} ${detailed ? styles.tracesDetailed : ""}`} aria-label="Normalized seeded driver and reference telemetry traces">
      <div><span>BRAKE</span><svg viewBox="0 0 440 48" preserveAspectRatio="none" aria-hidden="true"><path className={styles.traceReference} d="M0 41 L72 41 L96 7 L176 7 L201 36 L274 39 L304 17 L351 35 L440 40" /><path className={styles.traceDriver} d="M0 41 L83 41 L110 10 L185 9 L219 38 L280 40 L318 23 L365 38 L440 40" /></svg></div>
      <div><span>THROTTLE</span><svg viewBox="0 0 440 48" preserveAspectRatio="none" aria-hidden="true"><path className={styles.traceReference} d="M0 7 L68 7 L104 41 L190 41 L224 10 L282 7 L315 36 L365 12 L440 7" /><path className={styles.traceDriver} d="M0 8 L79 8 L117 42 L198 42 L235 13 L291 9 L328 40 L375 16 L440 8" /></svg></div>
      <div className={styles.traceLegend}><span><i /> DRIVER</span><span><i /> REFERENCE</span></div>
    </div>
  );
}

function Circuit({ className, track }: { className: string | undefined; track: TrackKey }) {
  const trackData = TRACKS[track];

  return (
    <svg className={className} viewBox="0 0 500 420" role="img" aria-label={`${trackData.name} circuit outline with animated telemetry marker`} data-track={track}>
      <title>{`${trackData.name} circuit outline`}</title>
      <path className={styles.circuitShadow} d={trackData.path} />
      <path className={styles.circuitLine} d={trackData.path} />
      <circle className={styles.motionDot} data-motion-dot r="7"><animateMotion dur="7s" repeatCount="indefinite" path={trackData.path} /></circle>
      <circle className={styles.motionDotStatic} cx={trackData.start[0]} cy={trackData.start[1]} r="7" />
      <circle className={styles.cornerMarker} cx={trackData.marker[0]} cy={trackData.marker[1]} r="12" />
      <text className={styles.trackName} x="472" y="392" textAnchor="end">{trackData.shortName}</text>
    </svg>
  );
}

function WorkflowStep({ index, title, text, icon }: { index: string; title: string; text: string; icon: React.ReactNode }) {
  return <li><span>{index}</span><i>{icon}</i><div><strong>{title}</strong><p>{text}</p></div></li>;
}
