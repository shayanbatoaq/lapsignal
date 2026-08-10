import { describe, expect, it } from "vitest";
import { collectorHeartbeatSchema, telemetrySampleSchema } from "../src/index";

describe("telemetry contract", () => {
  it("rejects invented out-of-range controls", () => {
    const result = telemetrySampleSchema.safeParse({ schema_version: 1, throttle_0_1: 1.2 });
    expect(result.success).toBe(false);
  });
  it("exposes defensible live diagnostics without a loss estimate",()=>{
    const value=collectorHeartbeatSchema.parse({collector_id:"c",collector_version:"v",adapter_version:"a",telemetry_schema_version:1,mode:"live",session_uid:"s",packet_rate_hz:96,packet_loss_available:false,out_of_order_frames:0,last_packet_at:null,build_identity:{component:"collector",application_version:"0.1.0-alpha.3",build_number:3,git_commit:"abc123",process_id:123,process_start_time:"2026-08-11T00:00:00.000Z"}});
    expect(value.packet_loss_available).toBe(false);
    expect("dropped_frames" in value).toBe(false);
  });
});
