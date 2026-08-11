import Link from "next/link";
import { SignalMark } from "@/components/Logo";
import { StateCard } from "@/components/UI";

export default function SessionNotFound() {
  return <div className="branded-state"><SignalMark size={58} decorative/><StateCard type="warning" title="Session not found">No saved session exists at this address.</StateCard><Link className="button secondary small" href="/app/sessions">Return to session library</Link></div>;
}
