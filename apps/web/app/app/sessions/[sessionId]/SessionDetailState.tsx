"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignalMark } from "@/components/Logo";
import { StateCard } from "@/components/UI";

export function ProcessingSessionState({ maxRetries = 3, retryIntervalMs = 2000 }: { maxRetries?: number; retryIntervalMs?: number }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (attempts >= maxRetries) return;
    const timer = window.setTimeout(() => {
      setAttempts((value) => value + 1);
      router.refresh();
    }, retryIntervalMs);
    return () => window.clearTimeout(timer);
  }, [attempts, maxRetries, retryIntervalMs, router]);
  return <div className="branded-state" role="status"><SignalMark size={58} decorative/><StateCard title="Session processing">The recording is saved. Lap analysis is still being materialized, so this page will check again {maxRetries - attempts} more {maxRetries - attempts === 1 ? "time" : "times"}.</StateCard></div>;
}

export function SessionRequestState({ status }: { status: "unreachable" | "invalid_response" | "server_error" }) {
  const content = {
    unreachable: ["Local API unavailable", "The saved session remains on disk, but the local API cannot be reached. Start LapSignal and try again."],
    invalid_response: ["Session data could not be read", "The API returned a response that does not match the saved-session contract. No data was changed."],
    server_error: ["Session service error", "The local API encountered an error while reading this saved session. No data was changed."]
  } as const;
  const [title, message] = content[status];
  return <div className="branded-state" role="alert"><SignalMark size={58} decorative/><StateCard type="warning" title={title}>{message}</StateCard></div>;
}
