import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = resolve(process.cwd(), "../../artifacts/qa/brand-integration");
const circuitArtifacts = resolve(process.cwd(), "../../artifacts/qa/circuit-map");

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
  await page.getByRole("link", { name: /Analyze a demo lap/i }).first().click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Session register" })).toBeVisible({ timeout: 20_000 });
  const collectorConnected = page.getByText("Collector connected", { exact: true }).first();
  if (await collectorConnected.isVisible()) {
    await expect(collectorConnected).toBeVisible();
    await expect(page.getByRole("status").getByText("Demo data")).toHaveCount(0);
  } else {
    await expect(page.getByRole("status").getByText(/Demo data|Recorded replay/)).toBeVisible();
  }
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

test("session detail, comparison, debrief and evidence archive", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/app/sessions");
  await page.locator('a[href="/app/sessions/f1-controller-silverstone"]').click();
  await expect(page).toHaveURL(/\/app\/sessions\/f1-controller-silverstone/, { timeout: 20_000 });
  await expect(page.getByText("Highest-value signals")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Invalid lap · coaching available", { exact: true })).toBeVisible();
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

test("replay updates the live page", async ({ page }, testInfo) => {
  await page.goto("/app/live");
  const replay = page.getByRole("button", { name: /Replay demo telemetry|Run demo replay/i }).first();
  if (await replay.isVisible()) await replay.click();
  await expect(page.getByText("UDP packets/sec", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /SPA-FRANCORCHAMPS|No fresh telemetry|Track unavailable/i })).toBeVisible();
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

test("OpenRouter settings are server-safe and a finalized local session is durable", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  await createSyntheticLocalSession(testInfo.project.name);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "AI and consent" }).click();
  await expect(page.getByText("openai/gpt-5-mini", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Configured", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test AI connection" })).toBeVisible();
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

async function createSyntheticLocalSession(projectName: string) {
  const fixture = await readFile(
    resolve(process.cwd(), "../../data/fixtures/f1-2021-replay.jsonl"),
    "utf8"
  );
  const first = JSON.parse(fixture.split(/\r?\n/).find(Boolean)!);
  const sessionUid = `e2e-local-${projectName}-${Date.now()}`;
  const samples = [
    { ...first, session_uid: sessionUid, lap_number: 1, received_at_ms: Date.now() },
    {
      ...first,
      session_uid: sessionUid,
      lap_number: 2,
      frame_id: Number(first.frame_id) + 1,
      last_lap_time_ms: 91_234,
      received_at_ms: Date.now() + 1
    }
  ];
  const collectorId = `e2e-local-${projectName}`;
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
