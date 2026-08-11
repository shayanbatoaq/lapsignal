import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import pino from "pino";
import { telemetrySampleSchema, type CollectorHeartbeat, type TelemetrySample } from "@lapsignal/contracts";
import { F12021Adapter } from "./adapter.js";
import { ApiDelivery } from "./delivery.js";
import { collectorBuildIdentity } from "./build-identity.js";
import { parseF12021Packet } from "./protocol/parser.js";

interface ReplayResult {
  samples: number;
  rejected: number;
  sessions: number;
  finalized: number;
  queued: number;
}

interface LoadedReplay {
  samples: TelemetrySample[];
  rejected: number;
  rawCapturePath: string | null;
  normalizedCapturePath: string | null;
}

async function loadNormalized(path: string): Promise<LoadedReplay> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  const samples: TelemetrySample[] = [];
  let rejected = 0;
  for (const line of lines) {
    try {
      const parsed = telemetrySampleSchema.safeParse(JSON.parse(line));
      if (parsed.success) samples.push(parsed.data);
      else rejected += 1;
    } catch {
      rejected += 1;
    }
  }
  return { samples, rejected, rawCapturePath: null, normalizedCapturePath: path };
}

async function loadRaw(path: string): Promise<LoadedReplay> {
  const buffer = await readFile(path);
  const adapter = new F12021Adapter();
  const samples: TelemetrySample[] = [];
  let rejected = 0;
  let offset = 0;
  while (offset + 12 <= buffer.length) {
    const packetLength = buffer.readUInt32LE(offset);
    const packetStart = offset + 12;
    if (packetStart + packetLength > buffer.length) {
      rejected += 1;
      offset = buffer.length;
      break;
    }
    try {
      const packet = parseF12021Packet(buffer.subarray(packetStart, packetStart + packetLength));
      const sample = adapter.ingest(packet, Number(buffer.readBigUInt64LE(offset + 4)));
      if (sample) samples.push(sample);
    } catch {
      rejected += 1;
    }
    offset = packetStart + packetLength;
  }
  if (offset !== buffer.length) rejected += 1;
  const normalizedPath = path.replace(/\.lsraw$/i, ".jsonl");
  return {
    samples,
    rejected,
    rawCapturePath: path,
    normalizedCapturePath: existsSync(normalizedPath) ? normalizedPath : null
  };
}

async function loadReplay(path: string): Promise<LoadedReplay> {
  return extname(path).toLowerCase() === ".lsraw" ? loadRaw(path) : loadNormalized(path);
}

export async function replayFixture(
  fixturePath: string,
  apiUrl: string,
  dataDirectory: string,
  speed = 6
): Promise<ReplayResult> {
  const logger = pino({ name: "lapsignal-replay" });
  const { samples, rejected, rawCapturePath, normalizedCapturePath } = await loadReplay(fixturePath);
  const sessionUids = [...new Set(samples.map((sample) => sample.session_uid))];
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
    packet_loss_available: false,
    out_of_order_frames: 0,
    last_packet_at: null,
    build_identity: collectorBuildIdentity()
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
  let finalized = 0;
  if (delivery.queued() === 0) {
    for (const sessionUid of sessionUids) {
      const accepted = await delivery.sessionEvent({
        collector_id: collectorId,
        session_uid: sessionUid,
        event: "session_ended",
        interrupted: false,
        raw_capture_path: rawCapturePath,
        normalized_capture_path: normalizedCapturePath
      });
      if (accepted) finalized += 1;
    }
  }
  const result = {
    samples: samples.length,
    rejected,
    sessions: sessionUids.length,
    finalized,
    queued: delivery.queued()
  };
  logger.info(result, "replay complete");
  return result;
}
