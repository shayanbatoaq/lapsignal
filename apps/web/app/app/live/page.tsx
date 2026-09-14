import { LiveSession } from "./LiveSession";
import { ShowcasePlayback } from "./ShowcasePlayback";
import { isShowcaseMode } from "@/lib/runtime-server";

export default function LivePage() { return isShowcaseMode() ? <ShowcasePlayback/> : <LiveSession/>; }
