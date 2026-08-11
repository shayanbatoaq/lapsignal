import { SessionSourceBanner } from "@/components/SessionAnalysis";
import { getSession, getSessions, getTelemetry } from "@/lib/data";
import { CompareWorkspace } from "./CompareWorkspace";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const query = await searchParams;
  const selected = query.session ? await getSession(query.session) : null;
  const session = selected ?? (await getSessions())[0]!;
  const clean = session.laps.filter((lap) => lap.valid).slice(0, 8);
  return <><SessionSourceBanner demoData={session.demo_data}/><CompareWorkspace session={session} traces={await getTelemetry(session, clean.map((lap) => lap.lap_number))}/></>;
}
