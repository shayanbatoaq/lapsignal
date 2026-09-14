import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "showcase.spec.ts", timeout: 45_000, fullyParallel: false, workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "laptop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "narrow-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 800 } } }
  ],
  webServer: {
    command: "corepack pnpm --filter @lapsignal/web exec next start --port 3100", cwd: "../..",
    url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120_000,
    env: { LAPSIGNAL_SHOWCASE: "true", OPENROUTER_API_KEY: "", NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000" }
  }
});
