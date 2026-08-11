import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisCoverage, ProvenanceList } from "@/components/SessionAnalysis";
import { ProcessingSessionState, SessionRequestState } from "@/app/app/sessions/[sessionId]/SessionDetailState";
import { sanitizedSessionAnalysis } from "./fixtures/sanitized-session-analysis";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.useRealTimers();
});

describe("saved-session analysis states", () => {
  it("keeps available groups visible and labels missing groups truthfully", () => {
    render(<AnalysisCoverage metrics={sanitizedSessionAnalysis}/>);
    expect(screen.getByText("Pace").parentElement).toHaveTextContent("Available");
    expect(screen.getByText("Stint").parentElement).toHaveTextContent("Not available");
    expect(screen.getByText("Braking").parentElement).toHaveTextContent("Not available");
    expect(screen.getByText("Throttle").parentElement).toHaveTextContent("Not available");
    expect(screen.getByText("Steering").parentElement).toHaveTextContent("Not available");
  });

  it("renders an empty normalized provenance object without calling Object.entries on null", () => {
    expect(() => render(<ProvenanceList provenance={{}}/>)).not.toThrow();
    expect(screen.getByText("Provenance unavailable")).toBeInTheDocument();
  });

  it("bounds processing refreshes", async () => {
    vi.useFakeTimers();
    render(<ProcessingSessionState maxRetries={2} retryIntervalMs={100}/>);
    await act(async () => vi.advanceTimersByTimeAsync(110));
    await act(async () => vi.advanceTimersByTimeAsync(110));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/check again 0 more times/i)).toBeInTheDocument();
  });

  it.each([
    ["unreachable", "Local API unavailable"],
    ["invalid_response", "Session data could not be read"],
    ["server_error", "Session service error"]
  ] as const)("renders the %s request state", (status, title) => {
    render(<SessionRequestState status={status}/>);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
