import { describe, expect, it } from "vitest";
import { formatLapTime } from "@lapsignal/telemetry-domain";

describe("formatters", () => {
  it("formats minute lap times", () => expect(formatLapTime(89_642)).toBe("1:29.642"));
  it("uses an em dash for unavailable telemetry", () => expect(formatLapTime(null)).toBe("—"));
});
