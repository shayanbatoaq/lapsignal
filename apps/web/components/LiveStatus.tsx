"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CircuitMapStatus } from "@lapsignal/contracts";
import type { RuntimeMode } from "@/lib/runtime";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
export type LiveState = "LIVE" | "REPLAY" | "OFFLINE";
export type LiveStatus = { state: LiveState; source_label: string; online: boolean; collector_id: string | null; mode: string | null; packet_rate_hz: number; packet_loss_available: false; out_of_order_frames: number; last_packet_at: string | null; session_uid: string | null; recording: boolean; current_sample: Record<string, unknown> | null; context: Record<string, unknown>; circuit_map?: CircuitMapStatus; performance_mode?: "equal" | "realistic" | "unknown"; performance_mode_source?: string };
const fallback: LiveStatus = { state: "OFFLINE", source_label: "Collector offline", online: false, collector_id: null, mode: null, packet_rate_hz: 0, packet_loss_available: false, out_of_order_frames: 0, last_packet_at: null, session_uid: null, recording: false, current_sample: null, context: {} };
const showcase: LiveStatus = { state: "REPLAY", source_label: "Recorded showcase playback", online: false, collector_id: null, mode: "showcase_playback", packet_rate_hz: 0, packet_loss_available: false, out_of_order_frames: 0, last_packet_at: null, session_uid: "showcase:uid:playback", recording: false, current_sample: null, context: { track_name: "Spa-Francorchamps", track_length_m: 7003, team_name: "Apex Dynamics", formula: "Modern open wheel", session_type: "Time Trial", weather: "Clear" }, performance_mode: "equal", performance_mode_source: "representative" };
const Context = createContext<{ status: LiveStatus; samples: Array<Record<string, unknown>>; runtimeMode: RuntimeMode }>({ status: fallback, samples: [], runtimeMode: "local" });

export function LiveStatusProvider({ children, mode }: { children: React.ReactNode; mode: RuntimeMode }) {
  const [status, setStatus] = useState(mode === "showcase" ? showcase : fallback);
  const [samples, setSamples] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    if (mode === "showcase") { setStatus(showcase); setSamples([]); return; }
    let stopped = false; let socket: WebSocket | undefined; let reconnect = 0;
    const refresh = async () => { try { const response = await fetch(`${API}/v1/collector/status`, { cache: "no-store" }); if (response.ok && !stopped) setStatus(await response.json()); } catch { if (!stopped) setStatus(fallback); } };
    const connect = () => { if (stopped) return; socket = new WebSocket(API.replace(/^http/, "ws") + "/v1/live"); socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.status) setStatus(message.status); if (message.samples) setSamples((current) => [...current, ...message.samples].slice(-240)); }; socket.onclose = () => { if (!stopped) reconnect = window.setTimeout(connect, 1500); }; };
    void refresh(); const poll = window.setInterval(refresh, 3000); connect();
    return () => { stopped = true; clearInterval(poll); clearTimeout(reconnect); if (socket) { socket.onclose = null; socket.close(); } };
  }, [mode]);
  const value = useMemo(() => ({ status, samples, runtimeMode: mode }), [status, samples, mode]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLiveStatus() { return useContext(Context); }
