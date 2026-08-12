import Link from "next/link";
import { SessionStorageBanner } from "@/components/SessionAnalysis";
import { StateCard } from "@/components/UI";
import { getSession } from "@/lib/data";
import { CoachView } from "./CoachView";

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const query = await searchParams;
  if (!query.session) return <DebriefEmpty title="Select a recorded session">Choose a finalized session to open its evidence-backed debrief.</DebriefEmpty>;
  const session = await getSession(query.session);
  if (!session) return <DebriefEmpty title="Session unavailable">The selected session or its analysis could not be loaded.</DebriefEmpty>;
  return <><SessionStorageBanner/><CoachView session={session}/></>;
}

function DebriefEmpty({title,children}:{title:string;children:React.ReactNode}){return <section className="surface-card empty-stage"><StateCard title={title}>{children}</StateCard><Link className="button" href="/app/sessions">Choose a session</Link></section>}
