"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { LiveStatusProvider } from "./LiveStatus";
import type { RuntimeMode } from "@/lib/runtime";

export function Providers({ children, mode }: { children: React.ReactNode; mode: RuntimeMode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }));
  return <QueryClientProvider client={client}><LiveStatusProvider mode={mode}>{children}</LiveStatusProvider></QueryClientProvider>;
}
