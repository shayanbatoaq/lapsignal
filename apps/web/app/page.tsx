import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Gamepad2, RadioTower, ScanLine } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getSessions } from "@/lib/data";
import { formatLapTime } from "@lapsignal/telemetry-domain";
import styles from "./landing.module.css";

const CIRCUIT_PATH = "M72 63 C94 29 149 20 194 36 C233 50 239 85 274 90 C319 96 355 57 399 63 C448 70 466 116 440 149 C414 181 361 169 337 199 C316 227 344 260 318 286 C287 318 228 286 195 303 C160 320 164 357 127 366 C83 376 44 343 55 306 C65 274 104 267 105 233 C105 203 66 194 53 166 C38 134 49 91 72 63 Z";

export default async function MarketingPage() {
  const sessions = await getSessions();
  const session = sessions.find((item) => item.id === "f1-controller-silverstone") ?? sessions[0]!;
  const pace = session.metrics.pace;
  const bestLap = session.laps.find((lap) => lap.valid && lap.lap_time_ms === pace.best_lap_ms) ?? session.laps.find((lap) => lap.valid)!;
  const available = pace.best_lap_ms - pace.theoretical_best_ms;
  const finding = session.findings[0]!;
  const cleanLaps = `${pace.clean_laps}/${session.laps.length}`;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Marketing navigation">
          <Logo />
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
            <Circuit className={styles.heroCircuit} label="Original illustrative circuit outline" />
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
                <Circuit className={styles.analysisCircuit} label="Original illustrative sample circuit with an active telemetry point" />
                <figcaption>Illustrative circuit · seeded telemetry values</figcaption>
                <div className={styles.cornerFlag}><span>ACTIVE</span><strong>C06</strong><small>592 m · brake zone</small></div>
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
          <Circuit className={styles.workflowCircuit} label="Decorative original circuit line connecting the workflow" />
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
          <Circuit className={styles.ctaCircuit} label="Decorative original circuit outline" />
          <div>
            <p className={styles.eyebrow}>READY FOR THE NEXT RUN</p>
            <h2 id="cta-title">Your next lap <span>starts here.</span></h2>
            <p>Open the reproducible Silverstone demo. Read the signal, take the call, and go again.</p>
            <Link className="button" href="/app">Analyze a demo lap <ArrowRight size={17} /></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Logo />
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

function Circuit({ className, label }: { className: string | undefined; label: string }) {
  return (
    <svg className={className} viewBox="0 0 500 420" role="img" aria-label={label}>
      <path className={styles.circuitShadow} d={CIRCUIT_PATH} />
      <path className={styles.circuitLine} d={CIRCUIT_PATH} />
      <circle className={styles.motionDot} data-motion-dot r="7"><animateMotion dur="7s" repeatCount="indefinite" path={CIRCUIT_PATH} /></circle>
      <circle className={styles.motionDotStatic} cx="72" cy="63" r="7" />
      <circle className={styles.cornerMarker} cx="337" cy="199" r="12" />
    </svg>
  );
}

function WorkflowStep({ index, title, text, icon }: { index: string; title: string; text: string; icon: React.ReactNode }) {
  return <li><span>{index}</span><i>{icon}</i><div><strong>{title}</strong><p>{text}</p></div></li>;
}
