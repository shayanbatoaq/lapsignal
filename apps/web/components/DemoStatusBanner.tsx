"use client";
import { ArrowUpRight,Database } from "lucide-react";
import Link from "next/link";
import { useLiveStatus } from "./LiveStatus";
export function DemoStatusBanner(){const {status}=useLiveStatus();if(status.state==="LIVE")return null;return <div className="demo-banner" role="status"><Database size={17} aria-hidden="true"/><div><strong>{status.state==="REPLAY"?"Recorded replay":"Demo data"}</strong><span>{status.state==="REPLAY"?"Replay telemetry is active":"Seeded telemetry · fixed random seed · no live connection required"}</span></div><Link href="/app/live">Open replay <ArrowUpRight size={14}/></Link></div>}
