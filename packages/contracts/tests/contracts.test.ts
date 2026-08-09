import { describe, expect, it } from "vitest";
import { telemetrySampleSchema } from "../src/index";

describe("telemetry contract", () => {
  it("rejects invented out-of-range controls", () => {
    const result = telemetrySampleSchema.safeParse({ schema_version: 1, throttle_0_1: 1.2 });
    expect(result.success).toBe(false);
  });
});
