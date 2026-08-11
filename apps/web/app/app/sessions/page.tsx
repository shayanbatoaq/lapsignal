import { DemoBanner } from "@/components/UI";
import { getSessionSummaries } from "@/lib/data";
import { SessionLibrary } from "./SessionLibrary";

export default async function SessionsPage(){return <><DemoBanner/><SessionLibrary sessions={await getSessionSummaries()}/></>}
