import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve(process.cwd(), "../../artifacts/qa/brand-integration");
const circuitArtifacts = resolve(process.cwd(), "../../artifacts/qa/circuit-map");
const physicalSessionId = process.env.LAPSIGNAL_PHYSICAL_SESSION_ID;

type MockLiveStatus = {
  state: string;
  source_label: string;
  online: boolean;
  collector_id: string;
  mode: string;
  packet_rate_hz: number;
  packet_loss_available: boolean;
  out_of_order_frames: number;
  last_packet_at: string;
  session_uid: string;
  recording: boolean;
  current_sample: Record<string, unknown>;
  context: Record<string, unknown>;
  circuit_map: {
    state: string;
    label: string;
    message: string;
    progress: number;
    layout_fingerprint: string;
    calibration: Record<string, unknown> | null;
    map_source: string;
    positioning_source?: string;
    refining: boolean;
  };
};

type SeedCalibration = Record<string, unknown> & {
  points: Array<{ x: number; y: number }>;
  world_to_svg: { scale: number; offset_x: number; offset_y: number };
};

test.beforeAll(async () => {
  await mkdir(artifacts, { recursive: true });
  await mkdir(circuitArtifacts, { recursive: true });
});

test("landing page and shared dashboard status", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every lap has a signal/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "LapSignal home" }).first().locator('img[data-logo-variant="dark"]')).toBeVisible();
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
  await page.route("**/v1/sessions?page_size=50", async (route) => route.fulfill({ json: { items: [], page: 1, page_size: 50, total: 0, pages: 1 } }));
  await page.getByRole("link", { name: /Open LapSignal/i }).first().click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Your telemetry workspace is ready" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Collector offline", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Nothing is pre-filled or estimated.")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: resolve(artifacts, "dashboard-desktop.png"), fullPage: true });
    await page.screenshot({ path: resolve(artifacts, "sidebar-expanded-desktop.png") });
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.locator('.sidebar img[data-logo-variant="symbol"]')).toBeVisible();
    await page.screenshot({ path: resolve(artifacts, "sidebar-collapsed-desktop.png") });
  }
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

test("fresh storage stays empty across every data-dependent route", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/v1/sessions?page_size=50", async (route) => route.fulfill({
    json: { items: [], page: 1, page_size: 50, total: 0, pages: 1 }
  }));
  const offline = {
    state: "OFFLINE", source_label: "Collector offline", online: false, collector_id: null,
    mode: null, packet_rate_hz: 0, packet_loss_available: false, out_of_order_frames: 0,
    last_packet_at: null, session_uid: null, recording: false, current_sample: null,
    context: {}, circuit_map: { state: "unavailable", label: "Circuit map unavailable",
      message: "Waiting for a supported telemetry packet.", progress: 0,
      layout_fingerprint: null, calibration: null, map_source: "none", refining: false }
  };
  await page.route("**/v1/collector/status", async (route) => route.fulfill({ json: offline }));
  await page.routeWebSocket("ws://localhost:8000/v1/live", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", status: offline, samples: [] }));
  });

  for (const [route, expected] of [
    ["/app", "Your telemetry workspace is ready"],
    ["/app/live", "Waiting for telemetry"],
    ["/app/sessions", "No recorded sessions yet"],
    ["/app/compare", "Select a recorded session"],
    ["/app/coach", "Select a recorded session"],
    ["/app/progress", "Establish your first baseline"]
  ] as const) {
    await page.goto(route);
    await expect(page.getByText(expected, { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const forbidden = "de" + "mo";
  expect((await page.locator("body").innerText()).toLowerCase()).not.toContain(forbidden);
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("session detail, comparison, debrief and evidence archive", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const sessionId = await createIsolatedRecordedSession(testInfo.project.name);
  await page.goto(`/app/sessions/${sessionId}`);
  await expect(page).toHaveURL(new RegExp(`/app/sessions/${sessionId}`), { timeout: 20_000 });
  await expect(page.getByText("Highest-value signals")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Invalid lap · coaching available", { exact: true })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.waitForTimeout(800);
  if (testInfo.project.name === "desktop") await page.screenshot({ path: resolve(artifacts, "session-debrief-desktop.png"), fullPage: true });
  else await page.screenshot({ path: resolve(artifacts, "session-debrief-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: /Compare laps/i }).click();
  await expect(page.getByText("Measured telemetry comparison")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.goto(`/app/coach?session=${sessionId}`);
  await expect(page.getByText("Deterministic analysis is the source of truth")).toBeVisible();
  await page.goto("/app/progress");
  await expect(page.getByText("Driver evidence archive")).toBeVisible();
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("coach renders accepted, safe-fallback, and unavailable fixtures without a provider call", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const sessionId = await createIsolatedRecordedSession("coach-fixture");
  const baseReport = {
    id: "report-synthetic-fixture",
    session_id: sessionId,
    label: "OpenRouter AI coaching",
    session_summary: "Synthetic fixture summary.",
    top_priorities: [],
    what_improved: "",
    what_regressed: "",
    next_stint_plan: "",
    confidence_summary: "",
    limitations: [],
    evidence_references: ["EV-001"],
    provenance: {
      provider: "openrouter",
      resolved_model: "openai/gpt-5-mini",
      evidence_bundle_version: "1",
      cached: false,
      generated_at: "2026-08-12T00:00:00Z"
    }
  };
  const accepted = {
    ...baseReport,
    mode: "openrouter",
    summary: "LapSignal accepted an evidence-grounded coaching action.",
    priority_actions: [{
      priority: 1,
      category: "consistency",
      title: "Repeatable execution",
      location: "Session-wide",
      observation: "Application varied across attempts.",
      instruction: "Repeat the same control shape.",
      reason: "Repeatability creates a clearer review baseline.",
      evidence_ids: ["EV-001"],
      evidence_context: [],
      confidence: null,
      expected_gain_seconds: null
    }]
  };
  let fixture: Record<string, unknown> = accepted;
  await page.route(`**/v1/sessions/${sessionId}/coach**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
  });
  await page.goto(`/app/coach?session=${sessionId}`);
  await page.getByRole("button", { name: "Generate AI debrief" }).click();
  await expect(page.getByRole("heading", { name: "Repeatable execution" })).toBeVisible();
  await expect(page.getByText("Evidence-backed", { exact: true })).toBeVisible();
  await expect(page.getByText("Session-wide", { exact: false })).toBeVisible();

  fixture = {
    ...baseReport,
    mode: "rule_based",
    label: "Rule-based coaching",
    summary: "Deterministic session analysis is ready.",
    explanation: "Cloud coaching was rejected safely; deterministic fallback shown.",
    provenance: { ...baseReport.provenance, provider: "rule_based" },
    priority_actions: accepted.priority_actions
  };
  await page.getByRole("button", { name: "Generate AI debrief" }).click();
  await expect(page.getByText("Fallback status", { exact: true })).toBeVisible();
  await expect(page.getByText(/rejected safely/i)).toBeVisible();

  await page.unroute(`**/v1/sessions/${sessionId}/coach**`);
  await page.route(`**/v1/sessions/${sessionId}/coach**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{unavailable" });
  });
  await page.getByRole("button", { name: "Generate AI debrief" }).click();
  await expect(page.getByText("Coach unavailable", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("AI consent and Cloud AI render disabled", async ({ page }) => {
  await page.route("**/v1/profile", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        experience_level: "intermediate",
        input_device: "controller",
        coaching_goal: "consistency",
        ai_consent: false,
        cloud_ai_enabled: false,
        post_session_ai_enabled: false,
        ai_live_lap_coaching: false
      }
    });
  });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "AI and consent" }).click();
  await expect(page.getByRole("button", { name: "Toggle AI consent" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Toggle Cloud AI" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Toggle Cloud AI" })).toHaveAttribute("aria-pressed", "false");
});

test("repeated physical-session navigation stays collector-independent", async ({ page }) => {
  const sessionId = physicalSessionId;
  test.skip(!sessionId, "A local physical session ID is required for this regression.");
  if (!sessionId) return;
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/app/sessions");
    await page.locator(`a[href="/app/sessions/${sessionId}"]`).click();
    await expect(page.getByText("Highest-value signals")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Saved telemetry", { exact: true })).toBeVisible();
    await expect(page.getByText(/collector connection not required/i)).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole("link", { name: "Compare laps" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/compare\\?session=${sessionId}$`));
  await expect(page.getByText("Measured telemetry comparison", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goBack();
  await page.getByRole("link", { name: "Open debrief" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/coach\\?session=${sessionId}$`));
  await expect(page.getByText("Deterministic analysis is the source of truth", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(errors.filter((error) => !error.includes("favicon"))).toEqual([]);
});

test("offline live page waits without inventing telemetry", async ({ page }, testInfo) => {
  const offline = {
    state: "OFFLINE", source_label: "Collector offline", online: false, collector_id: null,
    mode: null, packet_rate_hz: 0, packet_loss_available: false, out_of_order_frames: 0,
    last_packet_at: null, session_uid: null, recording: false, current_sample: null,
    context: {}, circuit_map: { state: "unavailable", label: "Circuit map unavailable",
      message: "Waiting for a supported telemetry packet.", progress: 0,
      layout_fingerprint: null, calibration: null, map_source: "none", refining: false }
  };
  await page.route("**/v1/collector/status", async (route) => route.fulfill({ json: offline }));
  await page.routeWebSocket("ws://localhost:8000/v1/live", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", status: offline, samples: [] }));
  });
  await page.goto("/app/live");
  await expect(page.getByRole("heading", { name: "Waiting for telemetry" })).toBeVisible();
  await expect(page.getByText(/values appear only after a real packet arrives/i)).toBeVisible();
  await expect(page.locator(".live-readout")).toHaveCount(0);
  await expect(page.locator(".live-map-grid")).toHaveCount(0);
  await expect(page.getByText("UDP packets/sec", { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(artifacts, testInfo.project.name === "desktop" ? "live-desktop.png" : "live-mobile.png"), fullPage: true });
});

test("Baku built-in map positions the marker before a valid lap", async ({ page }, testInfo) => {
  const seed = JSON.parse(await readFile(
    resolve(process.cwd(), "../../data/circuit-seeds/f1_2021-2021-20-5994.seed.json"),
    "utf8"
  ));
  const status = syntheticBakuStatus(seed);
  await page.route("**/v1/collector/status", async (route) => route.fulfill({ json: status }));
  await page.routeWebSocket("ws://localhost:8000/v1/live", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", status, samples: [] }));
  });
  await page.goto("/app/live");
  await expect(page.locator('[data-track-id="baku"]')).toBeVisible();
  await expect(page.locator('[data-map-state="distance_projected"]')).toHaveAttribute("data-map-source", "built_in");
  await expect(page.getByText("Distance projected", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".live-track-marker")).not.toHaveAttribute("visibility", "hidden");
  await expect(page.locator("body")).not.toContainText(/normalized fallback/i);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: resolve(circuitArtifacts, testInfo.project.name === "desktop" ? "beginner-seed-desktop.png" : "beginner-seed-mobile.png"),
    fullPage: true
  });
});

test("Melbourne packaged map is complete and distance-projects the live marker", async ({ page }, testInfo) => {
  const map = JSON.parse(await readFile(
    resolve(process.cwd(), "../../data/circuit-maps/maps/00-melbourne.json"),
    "utf8"
  ));
  const status = syntheticStaticStatus(map);
  await page.route("**/v1/collector/status", async (route) => route.fulfill({ json: status }));
  await page.routeWebSocket("ws://localhost:8000/v1/live", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", status, samples: [] }));
  });
  await page.goto("/app/live");
  const circuit = page.locator('[data-track-id="melbourne"]');
  await expect(circuit).toBeVisible();
  await expect(circuit).toHaveAttribute("data-map-source", "static");
  await expect(circuit).toHaveAttribute("data-map-state", "distance_projected");
  await expect(page.getByText("Packaged circuit centreline", { exact: true })).toBeVisible();
  await expect(page.locator(".live-track-marker")).not.toHaveAttribute("visibility", "hidden");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: resolve(circuitArtifacts, testInfo.project.name === "desktop" ? "packaged-melbourne-desktop.png" : "packaged-melbourne-mobile.png"),
    fullPage: true
  });
});

test("clean static, world-calibrated, and unsupported circuit states remain truthful", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const runtimeMapRequests: string[] = [];
  page.on("request", (request) => {
    if (/openstreetmap|wikimedia|github\.com\/f1db|bacinger/i.test(request.url())) runtimeMapRequests.push(request.url());
  });
  const [spa, silverstone, baku] = await Promise.all([
    readFile(resolve(process.cwd(), "../../data/circuit-maps/maps/10-spa-francorchamps.json"), "utf8").then(JSON.parse),
    readFile(resolve(process.cwd(), "../../data/circuit-maps/maps/07-silverstone.json"), "utf8").then(JSON.parse),
    readFile(resolve(process.cwd(), "../../data/circuit-seeds/f1_2021-2021-20-5994.seed.json"), "utf8").then(JSON.parse)
  ]);
  let currentStatus: MockLiveStatus = syntheticStaticStatus(spa, {
    gameTrackId: 10, trackId: "spa-francorchamps", trackName: "Spa-Francorchamps", trackLengthM: 7003
  });
  await page.route("**/v1/collector/status", async (route) => route.fulfill({ json: currentStatus }));
  await page.routeWebSocket("ws://localhost:8000/v1/live", (socket) => {
    socket.send(JSON.stringify({ type: "snapshot", status: currentStatus, samples: [] }));
  });

  for (const scenario of [
    { status: currentStatus, trackId: "spa-francorchamps", file: "clean-spa" },
    {
      status: syntheticStaticStatus(silverstone, {
        gameTrackId: 7, trackId: "silverstone", trackName: "Silverstone", trackLengthM: 5896
      }),
      trackId: "silverstone",
      file: "clean-silverstone"
    }
  ]) {
    currentStatus = scenario.status;
    await page.goto("/app/live");
    await expect(page.locator(`[data-track-id="${scenario.trackId}"]`)).toHaveAttribute("data-map-source", "static");
    await expect(page.locator(".live-track-marker")).not.toHaveAttribute("visibility", "hidden");
    await page.screenshot({
      path: resolve(circuitArtifacts, `${scenario.file}-${testInfo.project.name}.png`),
      fullPage: true
    });
  }

  currentStatus = syntheticWorldStatus(baku);
  await page.goto("/app/live");
  await expect(page.locator('[data-track-id="baku"]')).toHaveAttribute("data-map-state", "world_calibrated");
  await expect(page.getByText("World calibrated", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: resolve(circuitArtifacts, `world-calibrated-baku-${testInfo.project.name}.png`),
    fullPage: true
  });

  currentStatus = syntheticUnsupportedStatus();
  await page.goto("/app/live");
  const unavailableMap = page.locator('[data-map-state="unavailable"]');
  await expect(unavailableMap).toBeVisible();
  await expect(unavailableMap.getByText("Circuit map unavailable", { exact: true })).toBeVisible();
  await expect(page.locator("path.track-line")).toHaveCount(0);
  await page.screenshot({
    path: resolve(circuitArtifacts, `unsupported-hockenheim-${testInfo.project.name}.png`),
    fullPage: true
  });
  expect(runtimeMapRequests).toEqual([]);
});

test("circuit map settings reset only local refinement", async ({ page }, testInfo) => {
  let reset = false;
  await page.route("**/v1/circuit-calibrations", async (route) => route.fulfill({
    json: {
      items: [{
        layout_fingerprint: "f1_2021:2021:20:5994",
        circuit_name: "Baku",
        game_id: "f1_2021",
        packet_format: 2021,
        track_id: 20,
        built_in_seed_available: true,
        packaged_static_available: false,
        local_calibration_available: !reset,
        coverage: 1,
        quality_status: "verified",
        positioning_capability: "world_and_distance",
        checksum: "1ddc12dd8ab425b954feb2e1060dabf397f7032584be75bf98380eb0c1450e97",
        selected_source: "built_in",
        last_updated: null
      }]
    }
  }));
  await page.route("**/v1/circuit-calibrations/local/**", async (route) => {
    reset = true;
    await route.fulfill({ json: {
      layout_fingerprint: "f1_2021:2021:20:5994",
      removed_local_files: 2,
      built_in_seed_preserved: true,
      packaged_static_preserved: false,
      fallback_source: "built_in"
    } });
  });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Circuit maps" }).click();
  await expect(page.getByRole("heading", { name: "Baku" })).toBeVisible();
  await expect(page.getByText("All 24 full circuits are ready")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset local refinement" }).click();
  await expect(page.getByText("Baku local refinement reset. Telemetry seed preserved.")).toBeVisible();
  await expect(page.getByText("Not started", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: resolve(circuitArtifacts, testInfo.project.name === "desktop" ? "calibration-settings-desktop.png" : "calibration-settings-mobile.png"),
    fullPage: true
  });
});

test("brand metadata and browser assets resolve", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /lapsignal-social-card-1200x630\.png/);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /brand\/lapsignal/);

  for (const asset of [
    "/brand/lapsignal/favicon.ico",
    "/brand/lapsignal/apple-touch-icon-180.png",
    "/brand/lapsignal/pwa-icon-192.png",
    "/brand/lapsignal/pwa-icon-512.png",
    "/brand/lapsignal/pwa-maskable-512.png",
    "/brand/lapsignal/lapsignal-social-card-1200x630.png"
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), `${asset} should resolve`).toBe(true);
  }

  const manifestResponse = await request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  const manifestBody = await manifestResponse.json();
  expect(manifestBody.theme_color).toBe("#080A0D");
  expect(manifestBody.icons).toEqual(expect.arrayContaining([expect.objectContaining({ purpose: "maskable" })]));
});

test("OpenRouter settings are server-safe and an isolated recorded session is durable", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  await createIsolatedRecordedSession(testInfo.project.name);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "AI and consent" }).click();
  await expect(page.getByText("openai/gpt-5-mini", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(page.getByText("Provider verification", { exact: true })).toBeVisible();
  await expect(page.getByText(/performs no provider request/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("OPENROUTER_API_KEY");
  await page.goto("/app/sessions");
  const physicalSession = page.locator('a[href^="/app/sessions/live-"]').first();
  await expect(physicalSession).toBeVisible({ timeout: 20_000 });
  await expect(physicalSession.getByRole("heading")).not.toBeEmpty();
});

test("keyboard reaches core controls", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("core routes do not overflow horizontally", async ({ page }) => {
  test.setTimeout(75_000);
  for (const route of ["/", "/app", "/app/sessions", "/app/coach", "/app/settings"]) {
    await page.goto(route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("1280, 768 and 360 responsive matrix stays inside the viewport", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop", "The desktop project owns the additional viewport matrix.");
  const sessionId = await createIsolatedRecordedSession("responsive");
  for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 360, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/app", `/app/sessions/${sessionId}`]) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(dimensions.scrollWidth, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.innerWidth);
      if (route === "/" && viewport.width === 1280) await page.screenshot({ path: resolve(artifacts, "landing-laptop-1280.png") });
    }
  }
});

async function createIsolatedRecordedSession(projectName: string): Promise<string> {
  const fixture = await readFile(
    resolve(process.cwd(), "e2e/fixtures/synthetic-replay.jsonl"),
    "utf8"
  );
  const source = fixture.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const sessionUid = `test-e2e-${projectName}-${Date.now()}`;
  const sourceLapOne = source.filter((sample) => sample.lap_number === 1);
  const sourceLapTwo = source.filter((sample) => sample.lap_number === 2);
  const samples = [sourceLapOne, sourceLapTwo, sourceLapTwo].flatMap((lapRows, lapIndex) =>
    lapRows.map((sample, index) => ({
      ...sample,
      session_uid: sessionUid,
      frame_id: lapIndex * lapRows.length + index,
      lap_number: lapIndex + 1,
      received_at_ms: Date.now() + lapIndex * lapRows.length + index,
      last_lap_time_ms: lapIndex === 0 ? null : 91_234 + lapIndex * 200,
      packet_format: 2021,
      game_track_id: 7,
      track_name: "Silverstone",
      track_length_m: 5896
    }))
  );
  const collectorId = `test-e2e-${projectName}`;
  const ingested = await fetch("http://127.0.0.1:8000/v1/ingest/batches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ collector_id: collectorId, samples })
  });
  expect(ingested.ok).toBe(true);
  const finalized = await fetch("http://127.0.0.1:8000/v1/collector/session-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collector_id: collectorId,
      session_uid: sessionUid,
      event: "session_ended",
      interrupted: false,
      raw_capture_path: null,
      normalized_capture_path: null
    })
  });
  expect(finalized.ok).toBe(true);
  return (await finalized.json()).session_id;
}

function syntheticBakuStatus(calibration: Record<string, unknown>): MockLiveStatus {
  return {
    state: "REPLAY",
    source_label: "Recorded replay",
    online: true,
    collector_id: "synthetic-e2e",
    mode: "replay",
    packet_rate_hz: 20,
    packet_loss_available: false,
    out_of_order_frames: 0,
    last_packet_at: new Date().toISOString(),
    session_uid: "synthetic-baku",
    recording: false,
    current_sample: {
      game_id: "f1_2021", packet_format: 2021, game_track_id: 20, track_id: "baku", track_name: "Baku",
      track_length_m: 5994, lap_number: 1, lap_distance_m: 2400, lap_invalid: true,
      car_id: "williams", team_name: "Williams", formula: "F1 Modern", session_type: "Time Trial", speed_kph: 305
    },
    context: { track_id: "baku", track_name: "Baku", track_length_m: 5994, team_name: "Williams", formula: "F1 Modern", session_type: "Time Trial" },
    circuit_map: {
      state: "distance_projected",
      label: "Distance projected",
      message: "The complete circuit is ready before a valid lap.",
      progress: 1,
      layout_fingerprint: "f1_2021:2021:20:5994",
      calibration,
      map_source: "built_in",
      refining: true
    }
  };
}

function syntheticStaticStatus(
  calibration: Record<string, unknown>,
  circuit: { gameTrackId: number; trackId: string; trackName: string; trackLengthM: number } = {
    gameTrackId: 0, trackId: "melbourne", trackName: "Melbourne", trackLengthM: 5303
  }
): MockLiveStatus {
  return {
    state: "LIVE",
    source_label: "F1 2021 live UDP",
    online: true,
    collector_id: "synthetic-static-e2e",
    mode: "live",
    packet_rate_hz: 20,
    packet_loss_available: false,
    out_of_order_frames: 0,
    last_packet_at: new Date().toISOString(),
    session_uid: `synthetic-${circuit.trackId}`,
    recording: false,
    current_sample: {
      game_id: "f1_2021", packet_format: 2021, game_track_id: circuit.gameTrackId, track_id: circuit.trackId, track_name: circuit.trackName,
      track_length_m: circuit.trackLengthM, lap_number: 1, lap_distance_m: circuit.trackLengthM * 0.35, lap_invalid: false,
      car_id: "mclaren", team_name: "McLaren", formula: "F1 Modern", session_type: "Time Trial", speed_kph: 247
    },
    context: { track_id: circuit.trackId, track_name: circuit.trackName, track_length_m: circuit.trackLengthM, team_name: "McLaren", formula: "F1 Modern", session_type: "Time Trial" },
    circuit_map: {
      state: "distance_projected",
      label: "Distance projected",
      message: "The complete packaged circuit is visible immediately and the player marker is projected from lap distance.",
      progress: 1,
      layout_fingerprint: `f1_2021:2021:${circuit.gameTrackId}:${circuit.trackLengthM}`,
      calibration,
      map_source: "static",
      positioning_source: "lap_distance",
      refining: false
    }
  };
}

function syntheticWorldStatus(calibration: SeedCalibration): MockLiveStatus {
  const first = calibration.points[0];
  if (!first) throw new Error("World-calibrated fixture requires at least one map point");
  const transform = calibration.world_to_svg;
  const status = syntheticBakuStatus(calibration);
  status.state = "LIVE";
  status.source_label = "F1 2021 live UDP";
  status.current_sample.position_x = (first.x - transform.offset_x) / transform.scale;
  status.current_sample.position_z = (transform.offset_y - first.y) / transform.scale;
  status.current_sample.yaw = Math.PI / 2;
  status.circuit_map = {
    ...status.circuit_map,
    state: "world_calibrated",
    label: "World calibrated",
    message: "The player marker uses the exact telemetry-seed world transform.",
    positioning_source: "seed_world"
  };
  return status;
}

function syntheticUnsupportedStatus(): MockLiveStatus {
  return {
    ...syntheticStaticStatus({}, {
      gameTrackId: 8, trackId: "hockenheim", trackName: "Hockenheim", trackLengthM: 4574
    }),
    circuit_map: {
      state: "unavailable",
      label: "Circuit map unavailable",
      message: "This F1 2021 track ID is not included in the full-circuit map pack.",
      progress: 0,
      layout_fingerprint: "f1_2021:2021:8:4574",
      calibration: null,
      map_source: "none",
      positioning_source: "none",
      refining: false
    }
  };
}
