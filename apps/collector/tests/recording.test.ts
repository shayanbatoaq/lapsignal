import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionRecorder } from "../src/recording.js";
import { packetBuffer } from "./helpers.js";

describe("session recording", () => {
  it("flushes length-prefixed raw captures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lapsignal-recording-"));
    const recorder = new SessionRecorder(directory);
    await recorder.start("test");
    recorder.recordRaw(packetBuffer(), 1234);
    await recorder.close();
    const capture = await readFile(recorder.rawPath!);
    expect(capture.readUInt32LE(0)).toBe(1347);
    expect(capture.readBigUInt64LE(4)).toBe(1234n);
    expect(capture.length).toBe(12 + 1347);
  });
});
