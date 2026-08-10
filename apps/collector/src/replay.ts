import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pino from "pino";
import { telemetrySampleSchema, type CollectorHeartbeat, type TelemetrySample } from "@lapsignal/contracts";
import { ApiDelivery } from "./delivery.js";

export async function replayFixture(
  fixturePath: string,
  apiUrl: string,
  dataDirectory: string,
  speed = 6
): Promise<{ samples: number; rejected: number }> {
  const logger = pino({ name: "lapsignal-replay" });
  const lines = (await readFile(fixturePath, "utf8")).split(/\r?\n/).filter(Boolean);
  const samples: TelemetrySample[] = [];
  let rejected = 0;
  for (const line of lines) {
    const parsed = telemetrySampleSchema.safeParse(JSON.parse(line));
    if (parsed.success) samples.push(parsed.data);
    else rejected += 1;
  }
  const collectorId = `replay-${process.pid}`;
  const delivery = new ApiDelivery(
    apiUrl,
    collectorId,
    join(dataDirectory, "local", "replay-queue.jsonl"),
    logger
  );
  const heartbeat: CollectorHeartbeat = {
    collector_id: collectorId,
    collector_version: "0.1.0-alpha.3",
    adapter_version: "0.1.0",
    telemetry_schema_version: 1,
    mode: "replay",
    session_uid: samples[0]?.session_uid ?? null,
    packet_rate_hz: 20 * speed,
    dropped_frames: 0,
    out_of_order_frames: 0,
    last_packet_at: null
  };
  await delivery.heartbeat(heartbeat);
  for (let index = 0; index < samples.length; index += 4) {
    const chunk = samples.slice(index, index + 4);
    chunk.forEach((sample) => delivery.enqueue({ ...sample, received_at_ms: Date.now() }));
    await delivery.flush(4);
    await new Promise((resolve) => setTimeout(resolve, Math.max(10, 200 / speed)));
  }
  while (delivery.queued()) {
    const sent = await delivery.flush(250);
    if (!sent) break;
  }
  logger.info({ samples: samples.length, rejected, queued: delivery.queued() }, "replay complete");
  return { samples: samples.length, rejected };
}
