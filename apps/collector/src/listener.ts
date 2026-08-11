import dgram from "node:dgram";
import { join } from "node:path";
import pino from "pino";
import type { CollectorHeartbeat, CollectorSessionEvent } from "@lapsignal/contracts";
import { F12021Adapter } from "./adapter.js";
import { ApiDelivery } from "./delivery.js";
import { parseF12021Packet, PacketParseError } from "./protocol/parser.js";
import { SessionRecorder } from "./recording.js";
import { FrameTracker } from "./stats.js";
import { collectorBuildIdentity } from "./build-identity.js";
import { CircuitCalibrationManager } from "./calibration.js";

export interface ListenOptions {
  bindAddress: string;
  port: number;
  apiUrl: string;
  dataDirectory: string;
  batchIntervalMs: number;
  record: boolean;
}

export class CollectorListener {
  private readonly logger = pino({ name: "lapsignal-collector", level: process.env.LOG_LEVEL ?? "info" });
  private readonly adapter = new F12021Adapter();
  private readonly stats = new FrameTracker();
  private readonly recorder: SessionRecorder;
  private readonly calibrations: CircuitCalibrationManager;
  private readonly delivery: ApiDelivery;
  private readonly socket = dgram.createSocket("udp4");
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPacketAt: string | null = null;
  private sessionUid: string | null = null;
  private readonly collectorId = `collector-${process.pid}`;
  private stopped = false;
  private malformedPackets = 0;

  constructor(private readonly options: ListenOptions) {
    this.recorder = new SessionRecorder(join(options.dataDirectory, "captures"));
    this.calibrations = new CircuitCalibrationManager(options.dataDirectory);
    this.delivery = new ApiDelivery(
      options.apiUrl,
      this.collectorId,
      join(options.dataDirectory, "local", "collector-queue.jsonl"),
      this.logger
    );
  }

  async start(): Promise<void> {
    if (this.options.record) await this.recorder.start("f1-2021");
    this.socket.on("error", (error) => this.logger.error({ error: error.message }, "UDP socket error"));
    this.socket.on("message", (packet) => this.handlePacket(packet));
    await new Promise<void>((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(this.options.port, this.options.bindAddress, () => {
        this.socket.off("error", reject);
        resolve();
      });
    });
    this.flushTimer = setInterval(() => void this.delivery.flush(), this.options.batchIntervalMs);
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), 2000);
    this.logger.info(
      {
        bind: `${this.options.bindAddress}:${this.options.port}`,
        api: this.options.apiUrl,
        collectorVersion: "0.1.0-alpha.3",
        adapterVersion: "0.1.0",
        telemetrySchema: 1,
        recording: this.options.record,
        queued: this.delivery.queued(),
        buildIdentity: collectorBuildIdentity()
      },
      "LapSignal collector listening for F1 2021 UDP"
    );
  }

  private handlePacket(packet: Buffer): void {
    const receivedAtMs = Date.now();
    this.lastPacketAt = new Date(receivedAtMs).toISOString();
    this.recorder.recordRaw(packet, receivedAtMs);
    try {
      const parsed = parseF12021Packet(packet);
      const previousUid = this.sessionUid;
      this.stats.observe(parsed.header.sessionUid, parsed.header.packetId, parsed.header.frameIdentifier, receivedAtMs);
      this.sessionUid = parsed.header.sessionUid;
      if (previousUid && previousUid !== this.sessionUid) void this.finalize(previousUid, "session_changed", false);
      const sample = this.adapter.ingest(parsed, receivedAtMs);
      if (sample) {
        this.calibrations.ingest(sample, this.recorder.rawPath);
        this.recorder.recordNormalized(sample);
        this.delivery.enqueue(sample);
      }
      if (parsed.kind === "event" && ["SSTA", "SEND", "CHQF"].includes(parsed.data.code)) {
        this.logger.info({ event: parsed.data.code, sessionUid: this.sessionUid }, "session event");
        if (parsed.data.code === "SEND" && this.sessionUid) void this.finalize(this.sessionUid, "session_ended", false);
      }
      if (parsed.kind === "finalClassification") {
        this.logger.info({ classification: parsed.data }, "final classification received");
      }
    } catch (error) {
      this.malformedPackets += 1;
      const details = error instanceof PacketParseError ? { code: error.code, message: error.message } : { message: String(error) };
      if (this.malformedPackets <= 5 || this.malformedPackets % 100 === 0) {
        this.logger.warn({ ...details, bytes: packet.length, malformedPackets: this.malformedPackets }, "ignored malformed or incompatible UDP packet");
      }
    }
  }

  private heartbeatPayload(): CollectorHeartbeat {
    return {
      collector_id: this.collectorId,
      collector_version: "0.1.0-alpha.3",
      adapter_version: "0.1.0",
      telemetry_schema_version: 1,
      mode: "live",
      session_uid: this.sessionUid,
      packet_rate_hz: this.stats.packetRateHz(),
      packet_loss_available: false,
      out_of_order_frames: this.stats.outOfOrderFrames,
      last_packet_at: this.lastPacketAt,
      build_identity: collectorBuildIdentity()
    };
  }

  private async sendHeartbeat(): Promise<void> {
    const online = await this.delivery.heartbeat(this.heartbeatPayload());
    this.logger.info(
      {
        apiOnline: online,
        packetRateHz: this.stats.packetRateHz(),
        packetLoss: "unavailable",
        outOfOrderFrames: this.stats.outOfOrderFrames,
        queued: this.delivery.queued(),
        lastPacketAt: this.lastPacketAt,
        buildIdentity: collectorBuildIdentity()
      },
      "collector status"
    );
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.delivery.flush(1000);
    this.calibrations.finalize();
    this.delivery.persist();
    await this.recorder.close();
    if (this.sessionUid) await this.finalize(this.sessionUid, "collector_shutdown", true);
    await new Promise<void>((resolve) => this.socket.close(() => resolve()));
    this.logger.info({ queued: this.delivery.queued(), rawCapture: this.recorder.rawPath, normalized: this.recorder.normalizedPath }, "collector stopped and files flushed");
  }

  private async finalize(sessionUid: string, event: CollectorSessionEvent["event"], interrupted: boolean): Promise<void> {
    await this.delivery.flush(1000);
    const accepted = await this.delivery.sessionEvent({
      collector_id: this.collectorId, session_uid: sessionUid, event, interrupted,
      raw_capture_path: this.recorder.rawPath, normalized_capture_path: this.recorder.normalizedPath
    });
    this.logger.info({ event, sessionUid, accepted, interrupted }, "session finalization requested");
  }
}
