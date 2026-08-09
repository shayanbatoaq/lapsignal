import { DemoBanner } from "@/components/UI";
import { getSession, getSessions, getTelemetry } from "@/lib/data";
import { CompareWorkspace } from "./CompareWorkspace";

export default async function ComparePage({searchParams}:{searchParams:Promise<{session?:string}>}){const query=await searchParams; const sessions=await getSessions(); const session=(query.session?await getSession(query.session):null)??sessions[0]!; const clean=session.laps.filter((lap)=>lap.valid).slice(0,8); return <><DemoBanner/><CompareWorkspace session={session} traces={await getTelemetry(session,clean.map((lap)=>lap.lap_number))}/></>}
