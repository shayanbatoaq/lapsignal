import { describe, expect, it } from "vitest";
import { FrameTracker } from "../src/stats.js";

describe("frame statistics", () => {
  it("does not infer network loss from render-frame gaps or different cadences", () => {
    const tracker = new FrameTracker();
    tracker.observe("session-a", 6, 100, 1000);
    tracker.observe("session-a", 6, 103, 1050);
    tracker.observe("session-a", 2, 500, 1060);
    tracker.observe("session-a", 6, 102, 1100);
    expect(tracker.outOfOrderFrames).toBe(1);
    expect(tracker.packetRateHz(1100)).toBe(30);
  });

  it("handles duplicates and resets diagnostics on session UID changes", () => {
    const tracker = new FrameTracker();
    tracker.observe("session-a", 6, 10, 1000);
    tracker.observe("session-a", 6, 10, 1050);
    tracker.observe("session-a", 6, 9, 1100);
    expect(tracker.outOfOrderFrames).toBe(1);
    tracker.observe("session-b", 6, 2, 1200);
    expect(tracker.outOfOrderFrames).toBe(0);
    expect(tracker.receivedPackets).toBe(1);
  });
});
