import { describe, expect, it } from "vitest";
import { FrameTracker } from "../src/stats.js";

describe("frame statistics", () => {
  it("estimates dropped and out-of-order frames per packet type", () => {
    const tracker = new FrameTracker();
    tracker.observe(6, 100);
    tracker.observe(6, 103);
    tracker.observe(6, 102);
    tracker.observe(2, 500);
    expect(tracker.droppedFrames).toBe(2);
    expect(tracker.outOfOrderFrames).toBe(1);
  });
});
