import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve(process.cwd(), "../../artifacts/qa/v0.1.0-alpha.2");

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test("landing page and demo dashboard", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Find the time/i })).toBeVisible();
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "landing-desktop.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "landing-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: /Open the seeded debrief/i }).click();
  await expect(page.getByText(/Pit-wall call/i)).toBeVisible();
  await expect(page.getByRole("status").getByText("Demo data")).toBeVisible();
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "dashboard-desktop.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "dashboard-mobile.png"), fullPage: true });
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("session detail, comparison, debrief and evidence archive", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/app/sessions");
  await page.getByRole("link", { name: /Silverstone/i }).click();
  await expect(page).toHaveURL(/\/app\/sessions\/f1-controller-silverstone/, { timeout: 20_000 });
  await expect(page.getByText("Highest-value signals")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.waitForTimeout(800);
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "session-debrief-desktop.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "session-debrief-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: /Compare laps/i }).click();
  await expect(page.getByText("Measured telemetry comparison")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.goto("/app/coach");
  await expect(page.getByText("Deterministic evidence is the source of truth")).toBeVisible();
  await page.goto("/app/progress");
  await expect(page.getByText("Driver evidence archive")).toBeVisible();
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("replay updates the live page", async ({ page }) => {
  await page.goto("/app/live");
  const replay = page.getByRole("button", { name: /Replay demo telemetry/i });
  if (await replay.isVisible()) await replay.click();
  await expect(page.getByText(/Telemetry stream active|Waiting for collector/)).toBeVisible();
});

test("keyboard reaches core controls", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("core routes do not overflow horizontally", async ({ page }) => {
  for (const route of ["/", "/app", "/app/sessions", "/app/coach", "/app/settings"]) {
    await page.goto(route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("1280, 768 and 360 responsive matrix stays inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The desktop project owns the additional viewport matrix.");
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 360, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/app", "/app/sessions/f1-controller-silverstone"]) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(dimensions.scrollWidth, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.innerWidth);
    }
  }
});
