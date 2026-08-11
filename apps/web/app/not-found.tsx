import Link from "next/link";
import { SignalMark } from "@/components/Logo";
export default function NotFound(){return <main id="main-content" className="report-page"><div className="report-sheet" style={{maxWidth:620,textAlign:"center"}}><SignalMark size={72} decorative/><h1 style={{fontFamily:"var(--font-display)",fontSize:"2.4rem"}}>That signal is not stored.</h1><p className="muted">The session or report may have been removed from local data.</p><Link href="/app" className="button">Return to overview</Link></div></main>}
