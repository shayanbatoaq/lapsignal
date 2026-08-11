#!/usr/bin/env node
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { runDoctor } from "./doctor.js";
import { inspectCapture } from "./inspect.js";
import { CollectorListener } from "./listener.js";
import { replayFixture } from "./replay.js";
import { calibrateCapture } from "./calibration-import.js";

const program = new Command();
program.name("lapsignal-collector").description("LapSignal native Windows F1 2021 UDP collector").version("0.1.0-alpha.4");

program.command("listen")
  .description("Listen for F1 2021 UDP telemetry")
  .option("--bind <address>", "bind address", process.env.COLLECTOR_BIND_ADDRESS ?? "0.0.0.0")
  .option("--port <number>", "UDP port", process.env.COLLECTOR_UDP_PORT ?? "20777")
  .option("--api-url <url>", "LapSignal API URL", process.env.COLLECTOR_API_URL ?? "http://localhost:8000")
  .option("--data-dir <path>", "local data directory", "data")
  .option("--no-record", "disable raw and normalized recording")
  .action(async (options) => {
    const listener = new CollectorListener({
      bindAddress: options.bind,
      port: Number(options.port),
      apiUrl: options.apiUrl,
      dataDirectory: resolve(options.dataDir),
      batchIntervalMs: 350,
      record: options.record
    });
    await listener.start();
    let stopping = false;
    const stopFile = process.env.LAPSIGNAL_STOP_FILE;
    let stopWatcher: NodeJS.Timeout | null = null;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      if (stopWatcher) clearInterval(stopWatcher);
      await listener.stop();
      process.exitCode = 0;
    };
    stopWatcher = setInterval(() => {
      if (stopFile && existsSync(stopFile)) {
        unlinkSync(stopFile);
        void shutdown();
      }
    }, 400);
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  });

program.command("replay")
  .description("Replay a LapSignal raw capture or normalized fixture through API ingestion and finalization")
  .argument("<capture>")
  .option("--api-url <url>", "LapSignal API URL", process.env.COLLECTOR_API_URL ?? "http://localhost:8000")
  .option("--data-dir <path>", "local data directory", "data")
  .option("--speed <multiplier>", "replay speed", "6")
  .action(async (capture, options) => {
    const result = await replayFixture(resolve(capture), options.apiUrl, resolve(options.dataDir), Number(options.speed));
    console.log(JSON.stringify(result, null, 2));
  });

program.command("inspect")
  .description("Inspect a LapSignal raw capture or normalized JSONL file")
  .argument("<capture>")
  .action(async (capture) => console.log(JSON.stringify(await inspectCapture(resolve(capture)), null, 2)));

program.command("calibrate")
  .description("Derive persistent circuit geometry from a local LapSignal raw capture")
  .argument("<capture>")
  .option("--data-dir <path>", "local data directory", "data")
  .action(async (capture, options) => {
    const result = await calibrateCapture(resolve(capture), resolve(options.dataDir));
    console.log(JSON.stringify(result, null, 2));
  });

program.command("doctor")
  .description("Check the UDP port, local IPv4 addresses, and API connection")
  .option("--bind <address>", "bind address", process.env.COLLECTOR_BIND_ADDRESS ?? "0.0.0.0")
  .option("--port <number>", "UDP port", process.env.COLLECTOR_UDP_PORT ?? "20777")
  .option("--api-url <url>", "LapSignal API URL", process.env.COLLECTOR_API_URL ?? "http://localhost:8000")
  .action(async (options) => console.log(JSON.stringify(await runDoctor(options.bind, Number(options.port), options.apiUrl), null, 2)));

await program.parseAsync();
