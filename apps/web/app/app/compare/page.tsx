import Link from "next/link";
import { SessionStorageBanner } from "@/components/SessionAnalysis";
import { StateCard } from "@/components/UI";
import { getSession, getTelemetry } from "@/lib/data";
import { CompareWorkspace } from "./CompareWorkspace";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const query = await searchParams;
  if (!query.session) return <CompareEmpty title="Select a recorded session">Open a saved session and choose Compare laps. At least two completed clean laps from the same session are required.</CompareEmpty>;
  const session = await getSession(query.session);
  if (!session) return <CompareEmpty title="Session unavailable">The selected recorded session could not be loaded. Choose another session from the library.</CompareEmpty>;
  const clean = session.laps.filter((lap) => lap.valid).slice(0, 8);
  if (clean.length < 2) return <CompareEmpty title="Two clean laps required">This session has {clean.length} eligible clean {clean.length === 1 ? "lap" : "laps"}. Record another clean lap in the same session to compare measured telemetry.</CompareEmpty>;
  return <><SessionStorageBanner/><CompareWorkspace session={session} traces={await getTelemetry(session, clean.map((lap) => lap.lap_number))}/></>;
}

function CompareEmpty({title,children}:{title:string;children:React.ReactNode}){return <section className="surface-card empty-stage"><StateCard title={title}>{children}</StateCard><Link className="button" href="/app/sessions">Choose a session</Link></section>}
