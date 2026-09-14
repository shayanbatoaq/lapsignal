"use client";
import { RadioTower } from "lucide-react";
import { useLiveStatus } from "./LiveStatus";
export function CollectorReadiness(){const {status,runtimeMode}=useLiveStatus();if(runtimeMode==="showcase")return <div className="state-card"><RadioTower size={20}/><div><strong>Public preview ready</strong><p>Representative data is bundled. No physical collector, API, or database is connected.</p></div></div>;return <div className="state-card"><RadioTower size={20}/><div><strong>{status.online?"Collector connected":"Collector offline"}</strong><p>{status.state==="LIVE"?"Fresh physical F1 2021 packets are active.":status.state==="REPLAY"?"Recorded replay is active.":"Start the native Windows listener when the PS4 is ready."}</p></div></div>}
