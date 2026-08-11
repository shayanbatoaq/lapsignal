import { Database } from "lucide-react";
import { StateCard } from "./UI";
import type { SessionDetail } from "@/lib/types";

type Metrics = SessionDetail["metrics"];

function recordHasValues(value: Record<string, unknown> | null): boolean {
  return value !== null && Object.keys(value).length > 0 && Object.values(value).length > 0;
}

export function SessionSourceBanner({ demoData }: { demoData: boolean }) {
  return <div className="demo-banner" role="status"><Database size={17} aria-hidden="true"/><div><strong>{demoData ? "Demo data" : "Saved telemetry"}</strong><span>{demoData ? "Seeded telemetry · fixed random seed" : "Stored locally · collector connection not required"}</span></div></div>;
}

export function AnalysisCoverage({ metrics }: { metrics: Metrics }) {
  const groups = [
    ["Pace", metrics.pace !== null],
    ["Stint", metrics.stint !== null],
    ["Braking", metrics.braking !== null && metrics.braking.length > 0],
    ["Throttle", recordHasValues(metrics.throttle)],
    ["Steering", recordHasValues(metrics.steering)]
  ] as const;
  return <div className="technical-list" aria-label="Analysis coverage">{groups.map(([label, available]) => <div className="technical-row" key={label}><span>{label}</span><strong>{available ? "Available" : "Not available"}</strong></div>)}</div>;
}

export function ProvenanceList({ provenance }: { provenance: SessionDetail["provenance"] }) {
  const entries = Object.entries(provenance);
  if (entries.length === 0) return <StateCard title="Provenance unavailable">No public analysis-chain metadata was recorded for this session.</StateCard>;
  return <div className="technical-list">{entries.map(([key, value]) => <div className="technical-row" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{String(value)}</strong></div>)}</div>;
}

export function UnavailableAnalysis({ label }: { label: string }) {
  return <StateCard title={`${label} unavailable`}>This session does not contain enough recorded evidence for this analysis group.</StateCard>;
}
