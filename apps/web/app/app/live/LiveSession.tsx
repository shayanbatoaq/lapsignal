"use client";

import { Activity, CircleStop, Radio, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveStatus } from "@/components/LiveStatus";
import { TrackMap } from "@/components/TrackMap";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const text = (value: unknown, fallback = "Unknown") =>
  typeof value === "string" && value ? value : fallback;

export function LiveSession() {
  const { status, samples } = useLiveStatus();
  const [mode, setMode] = useState(status.performance_mode ?? "unknown");
  const current = status.current_sample ?? {};
  const context = { ...status.context, ...current };
  const track = text(context.track_name, text(context.track_id, "Track unavailable"));
  const team = text(context.team_name, text(context.car_id, "Car unavailable"));
  const formula = text(context.formula, text(context.car_class, "Unknown formula"));
  const sessionType = text(context.session_type, "Unknown session");
  const lap = Number(current.lap_number ?? 0);
  const trackLength = Number(context.track_length_m ?? 0);
  const speedTrace = useMemo(
    () =>
      samples
        .map(
          (sample, index) =>
            `${(index / Math.max(1, samples.length - 1)) * 100},${86 - Number(sample.speed_kph ?? 0) / 4}`
        )
        .join(" "),
    [samples]
  );
  const chooseMode = async (next: "equal" | "realistic" | "unknown") => {
    setMode(next);
    await fetch(`${API}/v1/live/performance-mode`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        performance_mode: next,
        performance_mode_source: next === "unknown" ? "unknown" : "user"
      })
    });
  };
  const active = status.state === "LIVE" || status.state === "REPLAY";

  return (
    <div className="live-layout">
      <div className="surface-card">
        <div className="live-identity">
          <p className="eyebrow">{status.source_label}</p>
          <h2>
            {track.toUpperCase()} / {sessionType.toUpperCase()} / LAP {lap || "—"}
          </h2>
          <p>
            {team.toUpperCase()} / {formula.toUpperCase()} /{
              mode === "unknown"
                ? "PERFORMANCE MODE UNKNOWN"
                : `${mode.toUpperCase()} PERFORMANCE · USER SELECTED`
            }
          </p>
        </div>

        {!active && (
          <div className="connection-hero">
            <div className="connection-ring">
              <WifiOff size={32} />
            </div>
            <h2>Waiting for telemetry</h2>
            <p>
              Start the native Windows collector, then begin driving in F1 2021. Live circuit, car,
              lap, and telemetry values appear only after a real packet arrives.
            </p>
            <Link className="button" href="/app/settings">View collector setup</Link>
          </div>
        )}

        {active && <div className="live-map-grid">
          <TrackMap
            circuitMap={status.circuit_map}
            sample={current}
            trackName={track}
            online={status.online}
          />
          <div className="car-context">
            <span className="car-silhouette" aria-hidden="true">
              ◢▰◣
            </span>
            <strong>{team}</strong>
            <span>
              Car {String(context.car_number ?? "—")} · {formula}
            </span>
            <span>
              {text(context.weather, "Weather unavailable")} ·{
                trackLength ? `${trackLength} m` : "Length unavailable"
              }
            </span>
          </div>
        </div>}

        {active && (
          <>
            {mode === "unknown" && status.state === "LIVE" && (
              <div className="performance-prompt">
                <strong>Which car performance mode did you select in F1 2021?</strong>
                <div>
                  <button onClick={() => chooseMode("equal")}>Equal</button>
                  <button onClick={() => chooseMode("realistic")}>Realistic</button>
                  <button onClick={() => chooseMode("unknown")}>Not sure</button>
                </div>
                <small>User-supplied metadata — F1 2021 UDP does not expose this setting.</small>
              </div>
            )}
            <div className="live-readout">
              <Readout label="Current lap" value={String(lap || "—")} />
              <Readout
                label="Lap time"
                value={
                  current.current_lap_time_ms != null
                    ? `${(Number(current.current_lap_time_ms) / 1000).toFixed(3)}s`
                    : "—"
                }
              />
              <Readout
                label="Speed"
                value={current.speed_kph != null ? `${current.speed_kph} km/h` : "—"}
              />
              <Readout label="Gear" value={String(current.gear ?? "—")} />
              <Readout label="RPM" value={String(current.rpm ?? "—")} />
              <Readout
                label="Throttle"
                value={
                  current.throttle_0_1 != null
                    ? `${Math.round(Number(current.throttle_0_1) * 100)}%`
                    : "—"
                }
              />
              <Readout
                label="Brake"
                value={
                  current.brake_0_1 != null
                    ? `${Math.round(Number(current.brake_0_1) * 100)}%`
                    : "—"
                }
              />
              <Readout
                label="Steering"
                value={
                  current.steer_minus1_1 != null
                    ? Number(current.steer_minus1_1).toFixed(2)
                    : "—"
                }
              />
            </div>
            <div className="animated-trace" style={{ marginTop: 16 }}>
              <svg viewBox="0 0 100 90" preserveAspectRatio="none">
                <polyline className="trace-line" points={speedTrace || "0,80 100,80"} />
              </svg>
            </div>
          </>
        )}
      </div>

      <aside className="coach-side">
        <div className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Connection health</p>
              <h2>{status.online ? "Collector connected" : "Collector offline"}</h2>
            </div>
            <Radio size={18} color="var(--blue)" />
          </div>
          <div className="technical-list">
            <Technical label="Game / format" value={context.game_id&&context.packet_format?`${String(context.game_id)} / ${String(context.packet_format)}`:"Unavailable until telemetry arrives"} />
            <Technical label="Map positioning" value={status.circuit_map?.label ?? "Unavailable"} />
            <Technical
              label="Last packet"
              value={status.last_packet_at ? new Date(status.last_packet_at).toLocaleTimeString() : "Never"}
            />
            <Technical label="UDP packets/sec" value={String(status.packet_rate_hz)} />
            <Technical label="Packet loss" value="Unavailable" />
            <Technical label="Out of order" value={String(status.out_of_order_frames)} />
            <Technical label="Session UID" value={status.session_uid?.slice(-8) ?? "—"} />
          </div>
        </div>
        <div className="surface-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recording</p>
              <h2>Local capture</h2>
            </div>
            {status.recording ? <CircleStop size={18} color="var(--critical)" /> : <Activity size={18} />}
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Raw packets stay local. Normalized samples finalize into the session library on Session Ended,
            UID change, shutdown, or inactivity.
          </p>
          {!status.recording && <p className="muted" style={{fontSize:12}}>No recording is active. Run <span className="mono">pnpm collector:listen</span> before driving.</p>}
        </div>
      </aside>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="readout">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Technical({ label, value }: { label: string; value: string }) {
  return (
    <div className="technical-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
