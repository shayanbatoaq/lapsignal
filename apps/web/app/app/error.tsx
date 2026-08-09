"use client";
import { StateCard } from "@/components/UI";
export default function ErrorPage({ reset }: { reset: () => void }) { return <StateCard type="warning" title="This view could not load">The local API may be restarting. <button className="button small" onClick={reset}>Try again</button></StateCard>; }
