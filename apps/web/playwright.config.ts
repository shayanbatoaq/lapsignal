import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const isolatedDataRoot = mkdtempSync(join(tmpdir(), "lapsignal-e2e-"));
const databasePath = resolve(isolatedDataRoot, "lapsignal-e2e.db").replaceAll("\\", "/");
process.once("exit", () => {
  const resolved = resolve(isolatedDataRoot);
  if (resolved.startsWith(resolve(tmpdir())) && resolved.includes("lapsignal-e2e-")) {
    rmSync(resolved, { recursive: true, force: true });
  }
});

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }
  ],
  webServer: [
    {
      command: "uv run --project services/api uvicorn lapsignal.main:app --host 127.0.0.1 --port 8000",
      cwd: "../..",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `sqlite:///${databasePath}`,
        DATA_DIR: isolatedDataRoot,
        OPENROUTER_API_KEY: "",
        AI_MAX_RETRIES: "0"
      }
    },
    {
      command: "corepack pnpm --filter @lapsignal/web dev",
      cwd: "../..",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8000" }
    }
  ]
});
