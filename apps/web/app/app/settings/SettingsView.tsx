"use client";

import { Download, ExternalLink, MapPinned, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionHeading, StateCard } from "@/components/UI";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type Profile = {
  experience_level: "beginner" | "intermediate" | "advanced";
  input_device: "controller" | "wheel" | "unknown";
  primary_interest: "f1" | "gt3" | "endurance" | "mixed";
  coaching_goal: "pace" | "consistency" | "racecraft" | "tyre_management" | "learning";
  units: "metric" | "imperial";
  ai_consent: boolean;
  cloud_ai_enabled: boolean;
  post_session_ai_enabled: boolean;
  ai_live_lap_coaching: boolean;
};

type AIStatus = {
  provider: string;
  configured: boolean;
  coach_model: string;
  deep_model: string;
  fallback_available: boolean;
  reachable: boolean | null;
  last_error_category: string | null;
  last_successful_request_time: string | null;
  canonical_env: string;
};

type BuildIdentity = {
  component: string;
  application_version: string;
  build_number: number;
  git_commit: string;
  process_id: number;
  process_start_time: string;
};

type CalibrationItem = {
  layout_fingerprint: string;
  circuit_name: string;
  game_id: string;
  packet_format: number;
  track_id: number;
  built_in_seed_available: boolean;
  packaged_static_available: boolean;
  local_calibration_available: boolean;
  coverage: number;
  quality_status: string;
  positioning_capability: string;
  checksum: string | null;
  selected_source: string;
  last_updated: string | null;
};

const initial: Profile = {
  experience_level: "intermediate",
  input_device: "controller",
  primary_interest: "mixed",
  coaching_goal: "consistency",
  units: "metric",
  ai_consent: false,
  cloud_ai_enabled: false,
  post_session_ai_enabled: false,
  ai_live_lap_coaching: false
};

const tabs = [
  ["profile", "Driver profile"],
  ["circuits", "Circuit maps"],
  ["ai", "AI and consent"],
  ["data", "Data controls"],
  ["collector", "Collector"],
  ["about", "About"]
] as const;

export function SettingsView() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("profile");
  const [profile, setProfile] = useState(initial);
  const [ai, setAI] = useState<AIStatus | null>(null);
  const [webBuild, setWebBuild] = useState<BuildIdentity | null>(null);
  const [apiBuild, setApiBuild] = useState<BuildIdentity | null>(null);
  const [calibrations, setCalibrations] = useState<CalibrationItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refreshCalibrations = async () => {
    const payload = await fetch(`${API}/v1/circuit-calibrations`, { cache: "no-store" }).then((response) => response.json());
    setCalibrations(payload.items ?? []);
  };

  useEffect(() => {
    void Promise.all([
      fetch(`${API}/v1/profile`).then((response) => response.json()).then(setProfile),
      fetch(`${API}/v1/ai/status`).then((response) => response.json()).then(setAI),
      fetch(`${API}/health`).then((response) => response.json()).then(setApiBuild),
      fetch("/api/build").then((response) => response.json()).then(setWebBuild),
      refreshCalibrations()
    ]).catch(() => setMessage("A local service is offline."));
  }, []);

  const save = async (next: Profile) => {
    setProfile(next);
    try {
      const response = await fetch(`${API}/v1/profile`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next)
      });
      setMessage(response.ok ? "Settings saved to the local profile." : "Settings could not be saved.");
    } catch {
      setMessage("Local API is offline; settings were not changed.");
    }
  };

  const exportData = async () => {
    const payload = await fetch(`${API}/v1/export`).then((response) => response.json());
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lapsignal-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deleteData = async () => {
    if (!confirm("Permanently delete all local user telemetry and saved sessions?")) return;
    const response = await fetch(`${API}/v1/local-data?confirm=${encodeURIComponent("DELETE LOCAL DATA")}`, { method: "DELETE" });
    setMessage(response.ok ? "Local telemetry and saved sessions deleted." : "Nothing was deleted.");
  };

  const resetCalibration = async (item: CalibrationItem) => {
    if (!confirm(`Reset only the local refinement for ${item.circuit_name}? Packaged maps, telemetry seeds, and raw captures will be preserved.`)) return;
    const response = await fetch(
      `${API}/v1/circuit-calibrations/local/${encodeURIComponent(item.layout_fingerprint)}?confirm=${encodeURIComponent("RESET LOCAL REFINEMENT")}`,
      { method: "DELETE" }
    );
    const payload = await response.json();
    setMessage(
      response.ok
        ? `${item.circuit_name} local refinement reset. ${payload.built_in_seed_preserved ? "Telemetry seed preserved." : payload.packaged_static_preserved ? "Packaged map preserved." : "Circuit map remains unavailable."}`
        : payload.error?.message ?? "Local refinement was not reset."
    );
    if (response.ok) await refreshCalibrations();
  };

  return (
    <>
      <div className="session-detail-head">
        <div>
          <p className="eyebrow">Local-first controls</p>
          <h2>Settings and privacy</h2>
          <p>Cloud AI is opt-in. Raw telemetry remains local by design.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map(([key, label]) => (
            <button className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>
              {label}
            </button>
          ))}
        </nav>
        <section className="surface-card settings-section">
          {tab === "profile" && (
            <>
              <SectionHeading eyebrow="Defaults" title="Driver profile" />
              <Setting title="Input device" note="Used when the adapter cannot identify the device.">
                <select className="select" value={profile.input_device} onChange={(event) => void save({ ...profile, input_device: event.target.value as Profile["input_device"] })}>
                  <option value="controller">Controller</option>
                  <option value="wheel">Wheel</option>
                  <option value="unknown">Unknown</option>
                </select>
              </Setting>
              <Setting title="Units" note="Contracts remain metric internally.">
                <select className="select" value={profile.units} onChange={(event) => void save({ ...profile, units: event.target.value as Profile["units"] })}>
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial display</option>
                </select>
              </Setting>
            </>
          )}

          {tab === "circuits" && (
            <>
              <SectionHeading eyebrow="Beginner-first calibration" title="Circuit maps" />
              <StateCard title="All 24 full circuits are ready">
                Telemetry seeds and licensed packaged maps appear immediately. Partial local calibration can improve positioning diagnostics, but it never replaces a complete circuit silhouette.
              </StateCard>
              <div className="calibration-settings-list">
                {calibrations.map((item) => (
                  <article className="calibration-setting-card" key={item.layout_fingerprint}>
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">F1 track ID {item.track_id}</p>
                        <h3>{item.circuit_name}</h3>
                      </div>
                      <MapPinned size={19} color="var(--blue)" />
                    </div>
                    <div className="technical-list">
                      <Row label="Game / format" value={`${item.game_id} / ${item.packet_format}`} />
                      <Row label="Telemetry seed" value={item.built_in_seed_available ? "Available" : "Not available"} />
                      <Row label="Packaged map" value={item.packaged_static_available ? "Available" : "Not required"} />
                      <Row label="Local refinement" value={item.local_calibration_available ? "Available" : "Not started"} />
                      <Row label="Coverage" value={`${Math.round(item.coverage * 100)}% · ${item.quality_status}`} />
                      <Row label="Positioning" value={item.positioning_capability.replaceAll("_", " ")} />
                      <Row label="Selected source" value={item.selected_source.replaceAll("_", " ")} />
                      <Row label="Checksum" value={item.checksum ?? "Pending"} />
                      <Row label="Last updated" value={item.last_updated ? new Date(item.last_updated).toLocaleString() : "Built-in catalogue"} />
                    </div>
                    {item.local_calibration_available && (
                      <button className="button ghost small" onClick={() => void resetCalibration(item)}>
                        <Trash2 size={14} /> Reset local refinement
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

          {tab === "ai" && (
            <>
              <SectionHeading eyebrow="Explicit consent" title="OpenRouter AI coach" />
              <div className="technical-list">
                <Row label="Active provider" value={ai?.provider ?? "Checking…"} />
                <Row label="OpenRouter" value={ai?.configured ? "Configured" : "Not configured"} />
                <Row label="Coach model" value={ai?.coach_model ?? "—"} />
                <Row label="Deep analysis" value={ai?.deep_model ?? "—"} />
                <Row label="Fallback" value={ai?.fallback_available ? "Available" : "Unavailable"} />
                <Row label="Reachability" value={ai?.reachable === true ? "Validated" : ai?.reachable === false ? "Unavailable" : "Not tested"} />
                <Row label="Last success" value={ai?.last_successful_request_time ? new Date(ai.last_successful_request_time).toLocaleString() : "Never"} />
                <Row label="Last error" value={ai?.last_error_category ?? "None"} />
              </div>
              <Toggle title="AI consent" note="Allow compact derived Evidence Bundle v1 to be used by the optional coach." value={profile.ai_consent} onChange={(value) => void save({ ...profile, ai_consent: value, cloud_ai_enabled: value ? profile.cloud_ai_enabled : false })} />
              <Toggle title="Cloud AI" note="Server-side provider only. No raw captures, paths, identities, or network data." value={profile.cloud_ai_enabled} disabled={!profile.ai_consent} onChange={(value) => void save({ ...profile, cloud_ai_enabled: value })} />
              <Toggle title="Post-session automatic coaching" note="Allow one debrief after durable finalization." value={profile.post_session_ai_enabled} disabled={!profile.cloud_ai_enabled} onChange={(value) => void save({ ...profile, post_session_ai_enabled: value })} />
              <Toggle title="Per-lap coaching · experimental" note="Disabled by default; never runs per telemetry sample." value={profile.ai_live_lap_coaching} disabled={!profile.cloud_ai_enabled} onChange={(value) => void save({ ...profile, ai_live_lap_coaching: value })} />
              <StateCard title="Provider verification">
                Cloud coaching runs only from a selected recorded session after both consent gates are enabled. This page performs no provider request.
              </StateCard>
              <StateCard title="What leaves this laptop">
                Only compact lap summaries, deterministic metrics, evidence IDs, selected performance mode, and equipment context. Raw high-frequency telemetry never leaves through this feature.
              </StateCard>
            </>
          )}

          {tab === "data" && (
            <>
              <SectionHeading eyebrow="Ownership" title="Export or delete local data" />
              <Setting title="Export summary" note="Profile, sessions, findings and provenance; no high-frequency traces.">
                <button className="button secondary small" onClick={exportData}><Download size={14} /> Export</button>
              </Setting>
              <Setting title="Delete local user telemetry" note="Removes saved sessions and local telemetry after explicit confirmation.">
                <button className="button ghost small" onClick={deleteData}><Trash2 size={14} /> Delete</button>
              </Setting>
            </>
          )}

          {tab === "collector" && (
            <>
              <SectionHeading eyebrow="F1 2021 on PS4" title="Collector connection" />
              <div className="technical-list">
                <Row label="PowerShell" value="corepack pnpm collector:listen" />
                <Row label="Bind" value="0.0.0.0:20777" />
                <Row label="Format" value="2021" />
                <Row label="Recommended send rate" value="20 Hz" />
                <Row label="API" value="http://localhost:8000" />
              </div>
              <StateCard title="Same private network required">
                Enter the laptop IPv4 address in F1 2021 UDP settings and allow inbound UDP 20777 on the Private firewall profile if needed.
              </StateCard>
            </>
          )}

          {tab === "about" && (
            <>
              <SectionHeading eyebrow="Provenance" title="LapSignal versions" />
              <div className="technical-list">
                <Row label="Application" value={webBuild?.application_version ?? apiBuild?.application_version ?? "0.1.0-alpha.4"} />
                <Row label="Build" value={String(webBuild?.build_number ?? apiBuild?.build_number ?? 4)} />
                <Row label="Web process" value={webBuild ? `${webBuild.git_commit} · PID ${webBuild.process_id}` : "Checking…"} />
                <Row label="API process" value={apiBuild ? `${apiBuild.git_commit} · PID ${apiBuild.process_id}` : "Checking…"} />
                <Row label="Telemetry schema" value="1" />
                <Row label="Coach prompt" value="race-engineer-v3" />
              </div>
              <a className="button secondary" href="/" target="_blank">Product page <ExternalLink size={14} /></a>
            </>
          )}

          {message && (
            <div className="state-card">
              <ShieldCheck size={18} />
              <div><strong>Local status</strong><p>{message}</p></div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Setting({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><p>{note}</p></div>{children}</div>;
}

function Toggle({ title, note, value, disabled, onChange }: { title: string; note: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <Setting title={title} note={note}><button className={`toggle ${value ? "on" : ""}`} disabled={disabled} aria-pressed={value} aria-label={`Toggle ${title}`} onClick={() => onChange(!value)} /></Setting>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="technical-row"><span>{label}</span><strong>{value}</strong></div>;
}
