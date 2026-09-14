import { getSessionSummariesResult } from "@/lib/data";
import { SessionLibrary } from "./SessionLibrary";
import { isShowcaseMode } from "@/lib/runtime-server";

export default async function SessionsPage(){const result=await getSessionSummariesResult();return <SessionLibrary sessions={result.sessions} status={result.status} showcase={isShowcaseMode()}/>}
