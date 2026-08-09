import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { CollectorHeartbeat, TelemetrySample } from "@lapsignal/contracts";

export interface DeliveryLogger {
  info(payload: object, message: string): void;
  warn(payload: object, message: string): void;
}

export class ApiDelivery {
  private queue: TelemetrySample[] = [];
  private sending = false;

  constructor(
    private readonly apiUrl: string,
    private readonly collectorId: string,
    private readonly queuePath: string,
    private readonly logger: DeliveryLogger,
    private readonly maxQueue = 5000
  ) {
    mkdirSync(dirname(queuePath), { recursive: true });
    if (existsSync(queuePath)) {
      this.queue = readFileSync(queuePath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-maxQueue)
        .flatMap((line) => {
          try { return [JSON.parse(line) as TelemetrySample]; } catch { return []; }
        });
    }
  }

  enqueue(sample: TelemetrySample): void {
    this.queue.push(sample);
    if (this.queue.length > this.maxQueue) this.queue.splice(0, this.queue.length - this.maxQueue);
  }

  queued(): number { return this.queue.length; }

  async flush(batchSize = 250): Promise<number> {
    if (this.sending || this.queue.length === 0) return 0;
    this.sending = true;
    const batch = this.queue.slice(0, batchSize);
    try {
      const response = await fetch(`${this.apiUrl}/v1/ingest/batches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collector_id: this.collectorId, samples: batch }),
        signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      this.queue.splice(0, batch.length);
      this.persist();
      return batch.length;
    } catch (error) {
      this.persist();
      this.logger.warn({ error: error instanceof Error ? error.message : String(error), queued: this.queue.length }, "API unavailable; telemetry remains queued locally");
      return 0;
    } finally {
      this.sending = false;
    }
  }

  async heartbeat(payload: CollectorHeartbeat): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/v1/collector/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2500)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  persist(): void {
    writeFileSync(this.queuePath, this.queue.map((item) => JSON.stringify(item)).join("\n") + (this.queue.length ? "\n" : ""), "utf8");
  }
}
