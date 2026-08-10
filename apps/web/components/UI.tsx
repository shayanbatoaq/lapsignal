import { AlertTriangle, ArrowUpRight, Check, Info, type LucideIcon } from "lucide-react";
import type { Finding } from "@/lib/types";
import { DemoStatusBanner } from "./DemoStatusBanner";

export function DemoBanner() {
  return <DemoStatusBanner />;
}

export function ConnectionState({ online }: { online: boolean }) {
  return <span className={`status-chip ${online ? "" : "muted"}`}><span className={`status-dot ${online ? "live" : "idle"}`} />{online ? "Collector online" : "Collector offline"}</span>;
}

export function VersionBadge() {
  return <span className="tag mono">v0.1.0-alpha.3 · build 3</span>;
}

export function MetricCard({ label, value, detail, trend, icon: Icon }: { label: string; value: string; detail?: string; trend?: string; icon?: LucideIcon }) {
  return (
    <article className="metric-card">
      <div className="metric-label">{Icon && <Icon size={15} aria-hidden="true" />}<span>{label}</span></div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-detail">{trend && <span className="trend-positive"><ArrowUpRight size={13} /> {trend}</span>} {detail && <span>{detail}</span>}</div>
    </article>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

export function Confidence({ value }: { value: number }) {
  const label = value >= 0.85 ? "High" : value >= 0.68 ? "Medium" : "Low";
  return <span className={`confidence confidence-${label.toLowerCase()}`}><span className="confidence-lamp" aria-hidden="true" />{label} · {Math.round(value * 100)}%</span>;
}

export function SessionRail({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "loss" | "reference" | "positive" }) {
  return <div className={`session-rail rail-${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function DeltaBadge({ value, label }: { value: string; label?: string }) {
  return <span className="delta-badge"><strong>{value}</strong>{label && <span>{label}</span>}</span>;
}

export function SignalDivider({ label }: { label: string }) {
  return <div className="signal-divider" aria-label={label}><span>{label}</span><i /><b /></div>;
}

export function EvidenceCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const evidence = finding.evidence[0];
  return (
    <article className={`evidence-card ${compact ? "compact" : ""}`}>
      <div className="evidence-top"><span className="priority-index">P{finding.priority}</span><Confidence value={finding.confidence} /></div>
      <h3>{finding.title}</h3>
      <p>{finding.plain_language}</p>
      {!compact && evidence && <div className="evidence-proof"><span className="proof-icon"><Check size={14} /></span><div><strong>{evidence.metric.replaceAll("_", " ")}</strong><span>{formatEvidence(evidence.value, evidence.unit)}{evidence.delta != null ? ` · Δ ${evidence.delta > 0 ? "+" : ""}${evidence.delta}` : ""} · laps {evidence.lap_numbers.join(", ")}</span></div></div>}
      <div className="action-strip"><span>Next action</span><strong>{finding.recommended_action}</strong></div>
      {finding.limitations.length > 0 && <details><summary><Info size={14} /> Evidence limitations</summary><p>{finding.limitations.join(" ")}</p></details>}
    </article>
  );
}

function formatEvidence(value: number, unit: string) {
  if (unit === "score_0_100") return `${value}/100`;
  if (unit === "ms_per_lap") return `${value} ms/lap`;
  if (unit === "lap_distance_m") return `${value} m`;
  return `${value} ${unit}`;
}

export function StateCard({ type = "info", title, children }: { type?: "info" | "warning"; title: string; children: React.ReactNode }) {
  const Icon = type === "warning" ? AlertTriangle : Info;
  return <div className={`state-card ${type}`}><Icon size={20} /><div><strong>{title}</strong><p>{children}</p></div></div>;
}
