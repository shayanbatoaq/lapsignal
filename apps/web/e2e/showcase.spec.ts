import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const sessionId = "showcase:session:practice-03";
const reportId = "showcase:practice-03:report";
const screenshots = resolve(process.cwd(), "../../artifacts/qa/showcase");

test.beforeAll(async () => { await mkdir(screenshots, { recursive: true }); });

test("all showcase routes are direct-loadable, disclosed and network-isolated", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []; const forbiddenRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "localhost" || url.port === "8000" || url.protocol === "ws:" || url.protocol === "wss:" || !["127.0.0.1"].includes(url.hostname)) forbiddenRequests.push(request.url());
  });
  const routes: Array<[string, string | RegExp]> = [
    ["/", /Every lap has a signal/i], ["/app", "Best clean lap"], ["/app/live", "RECORDED SHOWCASE PLAYBACK"],
    ["/app/sessions", "3 sessions"], [`/app/sessions/${sessionId}`, "Highest-value signals"],
    ["/app/compare", "Measured telemetry comparison"], ["/app/coach", "Post-stint debrief"],
    ["/app/progress", "Driver evidence archive"], ["/app/settings", "Settings and privacy"],
    [`/report/${reportId}`, "One focused exercise."]
  ];
  for (const [route, expected] of routes) {
    await page.goto(route); await expect(page.getByText(expected, { exact: typeof expected === "string" }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto(`/app/sessions/${sessionId}`); await page.reload();
  await expect(page.locator('[data-track-id="spa-francorchamps"]')).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  expect(forbiddenRequests).toEqual([]); expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: resolve(screenshots, `${testInfo.project.name}-session.png`), fullPage: true });
});

test("comparison, coaching, progress and settings are useful and read-only", async ({ page }) => {
  const mutating: string[] = [];
  page.on("request", (request) => { if (!["GET", "HEAD"].includes(request.method())) mutating.push(`${request.method()} ${request.url()}`); });
  await page.goto("/app/compare");
  await expect(page.getByText(/Baseline · lap/i)).toBeVisible(); await expect(page.getByText(/Practice 03 · lap/i).first()).toBeVisible();
  await expect(page.getByText("3.120 s", { exact: true }).first()).toBeVisible();
  await page.goto("/app/coach"); await expect(page.getByText("Representative deterministic coaching", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Representative debrief" })).toBeDisabled();
  await expect(page.getByText(/no provider request/i)).toBeVisible();
  await page.goto("/app/progress"); await expect(page.getByText("3.120 s", { exact: true })).toBeVisible();
  await page.goto("/app/settings"); await expect(page.getByText(/Physical telemetry is not collected/i)).toBeVisible();
  await expect(page.getByRole("combobox").first()).toBeDisabled();
  await page.getByRole("button", { name: "AI and consent" }).click();
  await expect(page.getByRole("button", { name: "Toggle AI consent" })).toBeDisabled();
  await page.getByRole("button", { name: "Data controls" }).click();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled(); await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();
  expect(mutating).toEqual([]);
});

test("recorded playback controls work and reduced motion starts paused", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/app/live");
  await expect(page.getByRole("heading", { name: "Visualization paused" })).toBeVisible();
  const initial = await page.getByText(/%$/, { exact: false }).first().textContent();
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect(page.getByRole("button", { name: "Pause playback" })).toBeVisible();
  await expect.poll(async () => page.getByText(/%$/, { exact: false }).first().textContent()).not.toBe(initial);
  await page.getByRole("button", { name: "Pause playback" }).click(); await expect(page.getByRole("heading", { name: "Visualization paused" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle playback speed" }).click(); await expect(page.getByRole("button", { name: "Toggle playback speed" })).toHaveText("2×");
  await page.getByRole("button", { name: "Restart playback" }).click(); await expect(page.getByText("0%", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: resolve(screenshots, `${testInfo.project.name}-playback.png`), fullPage: true });
});
