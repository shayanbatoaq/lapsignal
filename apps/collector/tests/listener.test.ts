import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CollectorListener } from "../src/listener.js";

describe("collector shutdown", () => {
  it("binds natively and flushes recording streams on stop", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lapsignal-listener-"));
    const listener = new CollectorListener({
      bindAddress: "127.0.0.1",
      port: 0,
      apiUrl: "http://127.0.0.1:1",
      dataDirectory: directory,
      batchIntervalMs: 1000,
      record: true
    });
    await listener.start();
    await expect(listener.stop()).resolves.toBeUndefined();
    await expect(access(join(directory, "captures"))).resolves.toBeUndefined();
  });
});
