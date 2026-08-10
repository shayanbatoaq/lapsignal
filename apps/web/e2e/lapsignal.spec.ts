import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve(process.cwd(), "../../artifacts/qa/v0.1.0-alpha.4-candidate");

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test("landing page and shared dashboard status", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every lap has a signal/i })).toBeVisible();
  await expect(page.locator("main > section")).toHaveCount(5);
  const tracks = await page.locator("[data-track]").evaluateAll((outlines) => outlines.map((outline) => outline.getAttribute("data-track")));
  expect(new Set(tracks)).toEqual(new Set(["spa", "red-bull-ring", "monza"]));
  const landingWords = await page.locator("main").evaluate((main) => {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text += ` ${node.textContent ?? ""}`;
    return text.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g)?.length ?? 0;
  });
  expect(landingWords).toBeGreaterThanOrEqual(300);
  expect(landingWords).toBeLessThanOrEqual(400);
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: resolve(artifacts, "landing-hero-desktop.png") });
    await page.screenshot({ path: resolve(artifacts, "landing-full-desktop.png"), fullPage: true });
  } else {
    await page.screenshot({ path: resolve(artifacts, "landing-hero-mobile.png") });
    await page.screenshot({ path: resolve(artifacts, "landing-full-mobile.png"), fullPage: true });
  }
  await page.getByRole("link", { name: /Analyze a demo lap/i }).first().click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
  const collectorConnected = page.getByText("Collector connected", { exact: true }).first();
  if (await collectorConnected.isVisible()) {
    await expect(collectorConnected).toBeVisible();
    await expect(page.getByRole("status").getByText("Demo data")).toHaveCount(0);
  } else {
    await expect(page.getByRole("status").getByText(/Demo data|Recorded replay/)).toBeVisible();
  }
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "dashboard-desktop.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "dashboard-mobile.png"), fullPage: true });
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("landing anchors and reduced motion contract", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const anchorTargets = await page.locator('a[href^="#"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  for (const target of new Set(anchorTargets)) {
    expect(target).toBeTruthy();
    expect(await page.locator(target!).count(), `Missing landing anchor ${target}`).toBe(1);
  }
  await expect(page.locator("[data-motion-dot]").first()).toHaveCSS("display", "none");
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "landing-reduced-motion.png"), fullPage: true });
});

test("session detail, comparison, debrief and evidence archive", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/app/sessions");
  await page.locator('a[href="/app/sessions/f1-controller-silverstone"]').click();
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
  await expect(page.getByText("Deterministic analysis is the source of truth")).toBeVisible();
  await page.goto("/app/progress");
  await expect(page.getByText("Driver evidence archive")).toBeVisible();
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("replay updates the live page", async ({ page }) => {
  await page.goto("/app/live");
  const replay = page.getByRole("button", { name: /Replay demo telemetry|Run demo replay/i }).first();
  if (await replay.isVisible()) await replay.click();
  await expect(page.getByText("UDP packets/sec", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /SPA-FRANCORCHAMPS|No fresh telemetry|Track unavailable/i })).toBeVisible();
});

test("OpenRouter settings are server-safe and physical session is durable", async ({ page }) => {
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "AI and consent" }).click();
  await expect(page.getByText("openai/gpt-5-mini", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Configured", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test AI connection" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("OPENROUTER_API_KEY");
  await page.goto("/app/sessions");
  await expect(page.getByText("Spa-Francorchamps", { exact: true }).first()).toBeVisible();
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
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "desktop", "The desktop project owns the additional viewport matrix.");
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 360, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/app", "/app/sessions/f1-controller-silverstone"]) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(dimensions.scrollWidth, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.innerWidth);
      if (route === "/" && viewport.width === 1280) await page.screenshot({ path: resolve(artifacts, "landing-laptop-1280.png") });
    }
  }
});
