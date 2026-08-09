import { DemoBanner } from "@/components/UI";
import { getSessions } from "@/lib/data";
import { SessionLibrary } from "./SessionLibrary";

export default async function SessionsPage(){return <><DemoBanner/><SessionLibrary sessions={await getSessions()}/></>}
