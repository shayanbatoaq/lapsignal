import { describe, expect, it } from "vitest";
import { consistencyScore, downsampleIndices, formatLapTime } from "../src/index";

describe("telemetry helpers", () => {
  it("formats lap times precisely", () => expect(formatLapTime(92_345)).toBe("1:32.345"));
  it("scores stable laps highly", () => expect(consistencyScore([90_000, 90_100, 89_950])).toBeGreaterThan(98));
  it("preserves first and last point", () => expect(downsampleIndices(1000, 10)).toEqual(expect.arrayContaining([0, 999])));
});
