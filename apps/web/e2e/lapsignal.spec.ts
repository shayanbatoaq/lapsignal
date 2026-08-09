import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve(process.cwd(), "../../artifacts/qa");

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test("landing page and demo dashboard", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every lap/i })).toBeVisible();
  await page.getByRole("link", { name: /Explore the seeded demo/i }).click();
  await expect(page.getByText("Current coaching priority")).toBeVisible();
  await expect(page.getByRole("status").getByText("Demo data")).toBeVisible();
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "desktop-dashboard.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "mobile-dashboard.png"), fullPage: true });
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("session detail, comparison, coach and progress", async ({ page }) => {
  await page.goto("/app/sessions");
  await page.getByRole("link", { name: /Silverstone/i }).click();
  await expect(page).toHaveURL(/\/app\/sessions\/f1-controller-silverstone/, { timeout: 20_000 });
  await expect(page.getByText("Highest-value signals")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("link", { name: /Compare laps/i }).click();
  await expect(page.getByText("Lap comparison workspace")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.goto("/app/coach");
  await expect(page.getByText("Deterministic evidence is the source of truth")).toBeVisible();
  await page.goto("/app/progress");
  await expect(page.getByText("Driver progress")).toBeVisible();
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
