import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TelemetrySample } from "@lapsignal/contracts";

export class SessionRecorder {
  private raw: WriteStream | null = null;
  private normalized: WriteStream | null = null;
  rawPath: string | null = null;
  normalizedPath: string | null = null;

  constructor(private readonly captureDirectory: string) {}

  async start(sessionLabel = "session"): Promise<void> {
    if (this.raw) return;
    await mkdir(this.captureDirectory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const safeLabel = sessionLabel.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
    this.rawPath = join(this.captureDirectory, `${stamp}-${safeLabel}.lsraw`);
    this.normalizedPath = join(this.captureDirectory, `${stamp}-${safeLabel}.jsonl`);
    this.raw = createWriteStream(this.rawPath, { flags: "a" });
    this.normalized = createWriteStream(this.normalizedPath, { flags: "a", encoding: "utf8" });
  }

  recordRaw(packet: Buffer, receivedAtMs: number): void {
    if (!this.raw) return;
    const prefix = Buffer.alloc(12);
    prefix.writeUInt32LE(packet.length, 0);
    prefix.writeBigUInt64LE(BigInt(receivedAtMs), 4);
    this.raw.write(prefix);
    this.raw.write(packet);
  }

  recordNormalized(sample: TelemetrySample): void {
    this.normalized?.write(`${JSON.stringify(sample)}\n`);
  }

  async close(): Promise<void> {
    await Promise.all([endStream(this.raw), endStream(this.normalized)]);
    this.raw = null;
    this.normalized = null;
  }
}

function endStream(stream: WriteStream | null): Promise<void> {
  if (!stream) return Promise.resolve();
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}
