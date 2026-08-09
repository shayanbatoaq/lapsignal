import { DemoBanner } from "@/components/UI";
import { getSessions } from "@/lib/data";
import { CoachView } from "./CoachView";

export default async function CoachPage(){const session=(await getSessions())[0]!; return <><DemoBanner/><CoachView session={session}/></>}
