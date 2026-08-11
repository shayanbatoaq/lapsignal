"use client";
import { SignalMark } from "@/components/Logo";
import { StateCard } from "@/components/UI";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="branded-state"><SignalMark size={58} decorative /><StateCard type="warning" title="This view could not load">An unexpected rendering error occurred.</StateCard><button className="button small" onClick={reset}>Try again</button></div>; }
