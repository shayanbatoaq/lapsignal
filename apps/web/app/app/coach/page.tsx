import { SessionSourceBanner } from "@/components/SessionAnalysis";
import { getSession, getSessions } from "@/lib/data";
import { CoachView } from "./CoachView";

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const query = await searchParams;
  const selected = query.session ? await getSession(query.session) : null;
  const session = selected ?? (await getSessions())[0]!;
  return <><SessionSourceBanner demoData={session.demo_data}/><CoachView session={session}/></>;
}
