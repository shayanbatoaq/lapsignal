"use client";

import { useState } from "react";
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function PerformanceModeControl({ sessionId, initial = "unknown", source = "unknown", readOnly = false }: { sessionId: string; initial?: string; source?: string; readOnly?: boolean }) {
  const [mode, setMode] = useState(initial);
  const update = async (next: "equal" | "realistic" | "unknown") => {
    if (readOnly) return;
    setMode(next);
    await fetch(`${API}/v1/sessions/${sessionId}/performance-mode`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ performance_mode: next, performance_mode_source: next === "unknown" ? "unknown" : "user" }) });
  };
  return <div className="performance-control"><span className="tag">{mode === "unknown" ? "PERFORMANCE MODE UNKNOWN" : `${mode.toUpperCase()} PERFORMANCE · ${readOnly ? "REPRESENTATIVE" : source === "user" || mode !== initial ? "USER SELECTED" : source.toUpperCase()}`}</span><div><button disabled={readOnly} title={readOnly ? "Available in the local application" : undefined} onClick={() => update("equal")}>Equal</button><button disabled={readOnly} title={readOnly ? "Available in the local application" : undefined} onClick={() => update("realistic")}>Realistic</button><button disabled={readOnly} title={readOnly ? "Available in the local application" : undefined} onClick={() => update("unknown")}>Not sure</button></div>{readOnly && <small className="muted">Available in the local application</small>}</div>;
}
