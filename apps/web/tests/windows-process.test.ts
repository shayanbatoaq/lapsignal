import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Windows background process safety", () => {
  it("uses worker threads for Next development work", () => {
    expect(nextConfig.experimental?.workerThreads).toBe(true);
  });

  it("hides every project-owned synchronous child process window", async () => {
    const sources = await Promise.all([
      readFile(resolve(process.cwd(), "lib/build-identity.ts"), "utf8"),
      readFile(resolve(process.cwd(), "../collector/src/build-identity.ts"), "utf8"),
      readFile(resolve(process.cwd(), "../../scripts/dev-services.mjs"), "utf8"),
      readFile(resolve(process.cwd(), "../../scripts/generate-client.mjs"), "utf8")
    ]);
    for (const source of sources) {
      const launches = source.split(/execFileSync\(|spawnSync\(/).slice(1);
      expect(launches.length).toBeGreaterThan(0);
      expect(launches.every((launch) => launch.includes("windowsHide: true"))).toBe(true);
    }
  });
});
