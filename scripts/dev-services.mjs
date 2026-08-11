import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AI_SCHEMA_HASH,
  APPLICATION_VERSION,
  BUILD_NUMBER,
  buildIdentityFailures,
  evaluateService,
  manifestMatchesSpec,
  portOwnerMatchesManifest,
  processMatchesManifest,
  safeStopPlan,
  serviceFingerprint
} from "./dev-services-lib.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = join(REPO_ROOT, "data", "local", "dev-services");
const NODE = process.execPath;
const PYTHON = join(REPO_ROOT, "services", "api", ".venv", "Scripts", "python.exe");
const BASE_PYTHON = execFileSync(PYTHON, ["-c", "import sys;print(sys._base_executable)"], {
  encoding: "utf8",
  windowsHide: true
}).trim();
const requireFromCollector = createRequire(join(REPO_ROOT, "apps", "collector", "package.json"));
const collectorLoader = requireFromCollector.resolve("tsx");
const collectorLoaderUrl = pathToFileURL(collectorLoader).href;
const webRunner = join(REPO_ROOT, "scripts", "managed-web.mjs");
const collectorSource = join(REPO_ROOT, "apps", "collector", "src", "cli.ts");

const specs = [
  {
    service: "api",
    component: "api",
    executable: PYTHON,
    arguments: ["-m", "uvicorn", "lapsignal.main:app", "--host", "127.0.0.1", "--port", "8000"],
    workingDirectory: join(REPO_ROOT, "services", "api"),
    identityMarkers: ["uvicorn", "lapsignal.main:app", "--port", "8000"],
    portOwnerExecutables: [PYTHON, BASE_PYTHON],
    ports: [{ protocol: "tcp", port: 8000 }]
  },
  {
    service: "web",
    component: "web",
    executable: NODE,
    arguments: [webRunner, "--dir", join(REPO_ROOT, "apps", "web"), "--port", "3000"],
    workingDirectory: join(REPO_ROOT, "apps", "web"),
    identityMarkers: [webRunner, "--dir", join(REPO_ROOT, "apps", "web"), "--port", "3000"],
    portOwnerExecutables: [NODE],
    ports: [{ protocol: "tcp", port: 3000 }]
  },
  {
    service: "collector",
    component: "collector",
    executable: NODE,
    arguments: [
      "--import",
      collectorLoaderUrl,
      collectorSource,
      "listen",
      "--api-url",
      "http://127.0.0.1:8000",
      "--data-dir",
      join(REPO_ROOT, "data")
    ],
    workingDirectory: join(REPO_ROOT, "apps", "collector"),
    identityMarkers: [collectorLoaderUrl, collectorSource, "listen", "--data-dir", join(REPO_ROOT, "data")],
    portOwnerExecutables: [NODE],
    ports: [{ protocol: "udp", port: 20777 }]
  }
];

mkdirSync(STATE_DIR, { recursive: true });

function powershellPath() {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function powershellJson(script) {
  const output = execFileSync(
    powershellPath(),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  ).trim();
  if (!output) return [];
  const parsed = JSON.parse(output.replace(/^\uFEFF/, ""));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function processInventory() {
  return powershellJson(
    "@(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ processId=[int]$_.ProcessId; parentProcessId=[int]$_.ParentProcessId; executablePath=$_.ExecutablePath; commandLine=$_.CommandLine; creationDate=if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null } } }) | ConvertTo-Json -Compress -Depth 3"
  );
}

function portInventory() {
  return powershellJson(
    "$items=@(); $items += Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 3000,8000 } | ForEach-Object { [pscustomobject]@{ protocol='tcp'; port=[int]$_.LocalPort; processId=[int]$_.OwningProcess } }; $items += Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 20777 } | ForEach-Object { [pscustomobject]@{ protocol='udp'; port=[int]$_.LocalPort; processId=[int]$_.OwningProcess } }; @($items) | ConvertTo-Json -Compress -Depth 3"
  );
}

function manifestPath(service) {
  return join(STATE_DIR, `${service}.pid.json`);
}

function stopPath(service) {
  return join(STATE_DIR, `${service}.stop`);
}

function acquireManagerLock() {
  const path = join(STATE_DIR, "manager.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(path, "wx");
      writeFileSync(descriptor, `${process.pid}\n`);
      closeSync(descriptor);
      return () => {
        if (existsSync(path) && readFileSync(path, "utf8").trim() === String(process.pid)) {
          unlinkSync(path);
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const recordedPid = Number(readFileSync(path, "utf8").trim());
      const alive = Number.isInteger(recordedPid) && processInventory().some(
        (item) => Number(item.processId) === recordedPid
      );
      if (alive) throw new Error(`Another LapSignal service-manager process is active (PID ${recordedPid}).`);
      unlinkSync(path);
    }
  }
  throw new Error("Unable to acquire the LapSignal service-manager lock.");
}

function readManifest(service) {
  const path = manifestPath(service);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { invalid_json: true };
  }
}

function snapshot() {
  const processes = processInventory();
  const ports = portInventory();
  return specs.map((spec) =>
    evaluateService(spec, readManifest(spec.service), processes, ports)
  );
}

function printStatus(evaluations) {
  for (const item of evaluations) {
    const suffix = item.pid ? ` (PID ${item.pid})` : "";
    console.log(`${item.service}: ${item.state}${suffix}`);
  }
}

function currentGitIdentity() {
  try {
    execFileSync("git", ["-C", REPO_ROOT, "diff-index", "--quiet", "HEAD", "--"], {
      stdio: "ignore",
      windowsHide: true
    });
    return execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    }).trim();
  } catch {
    return "uncommitted";
  }
}

function createManifest(spec, pid, startedAt) {
  return {
    schema_version: 1,
    service: spec.service,
    pid,
    executable: spec.executable,
    arguments: spec.arguments,
    working_directory: spec.workingDirectory,
    process_start_time: startedAt,
    service_fingerprint: serviceFingerprint(spec)
  };
}

function startService(spec, gitCommit) {
  const startedAt = new Date().toISOString();
  const stdout = openSync(join(STATE_DIR, `${spec.service}.stdout.log`), "w");
  const stderr = openSync(join(STATE_DIR, `${spec.service}.stderr.log`), "w");
  const child = spawn(spec.executable, spec.arguments, {
    cwd: spec.workingDirectory,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
    env: {
      ...process.env,
      LAPSIGNAL_GIT_COMMIT: gitCommit,
      LAPSIGNAL_PROCESS_START_TIME: startedAt,
      LAPSIGNAL_MANAGED_SERVICE: spec.service,
      LAPSIGNAL_STOP_FILE: stopPath(spec.service)
    }
  });
  closeSync(stdout);
  closeSync(stderr);
  if (!child.pid) throw new Error(`Failed to obtain ${spec.service} PID.`);
  writeFileSync(manifestPath(spec.service), JSON.stringify(createManifest(spec, child.pid, startedAt), null, 2));
  child.unref();
  return { ...spec, pid: child.pid, startedAt };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await delay(300);
  }
  return false;
}

async function stopService(spec, evaluation) {
  const manifest = readManifest(spec.service);
  const processes = processInventory();
  const record = processes.find((item) => Number(item.processId) === evaluation.pid);
  if (!manifestMatchesSpec(manifest, spec) || !record || !processMatchesManifest(record, manifest, spec)) {
    throw new Error(`Refusing to stop ${spec.service}: PID identity changed.`);
  }
  writeFileSync(stopPath(spec.service), `${new Date().toISOString()}\n`);
  if (!(await waitForExit(evaluation.pid, 8_000))) {
    const refreshed = processInventory().find((item) => Number(item.processId) === evaluation.pid);
    const reevaluated = evaluateService(spec, manifest, refreshed ? [refreshed] : [], []);
    if (reevaluated.state !== "running" || !reevaluated.owned) {
      throw new Error(`Refusing forced stop for ${spec.service}: verification no longer passes.`);
    }
    execFileSync("taskkill.exe", ["/PID", String(evaluation.pid), "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    if (!(await waitForExit(evaluation.pid, 5_000))) {
      throw new Error(`${spec.service} PID ${evaluation.pid} did not exit.`);
    }
  }
  if (existsSync(stopPath(spec.service))) unlinkSync(stopPath(spec.service));
  unlinkSync(manifestPath(spec.service));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2_500) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function waitFor(check, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error(`${label} not ready`);
  while (Date.now() < deadline) {
    try {
      return await check();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(500);
    }
  }
  throw new Error(`${label} failed: ${lastError.message}`);
}

async function verifyApiIdentity(api, gitCommit) {
  return waitFor(async () => {
    const identity = await fetchJson("http://127.0.0.1:8000/health");
    const manifest = readManifest("api");
    const processes = processInventory();
    const owner = portInventory().find((item) => item.protocol === "tcp" && item.port === 8000);
    if (!owner || !portOwnerMatchesManifest(owner.processId, manifest, api, processes)) {
      throw new Error("api_port_owner_not_verified");
    }
    const failures = buildIdentityFailures(identity, {
      component: "api",
      gitCommit,
      processId: owner.processId,
      processStartTime: api.startedAt
    });
    if (failures.length) throw new Error(failures.join(","));
    return identity;
  }, "API build identity");
}

async function verifyAppStarted(started, gitCommit) {
  const api = started.find((item) => item.service === "api");
  const web = started.find((item) => item.service === "web");
  const health = await verifyApiIdentity(api, gitCommit);
  await waitFor(async () => {
    const response = await fetch("http://127.0.0.1:8000/docs", { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) throw new Error(`OpenAPI returned HTTP ${response.status}`);
    return true;
  }, "OpenAPI");
  const webIdentity = await waitFor(async () => {
    const identity = await fetchJson("http://127.0.0.1:3000/api/build");
    const failures = buildIdentityFailures(identity, { component: "web", gitCommit, processId: web.pid, processStartTime: web.startedAt });
    if (failures.length) throw new Error(failures.join(","));
    return identity;
  }, "web build identity");
  await waitFor(async () => {
    const response = await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`frontend returned HTTP ${response.status}`);
    return true;
  }, "frontend");
  return { health, webIdentity, collectorIdentity: null };
}

async function verifyStarted(started, gitCommit) {
  const identity = await verifyAppStarted(started, gitCommit);
  const collector = started.find((item) => item.service === "collector");
  const collectorStatus = await waitFor(async () => {
    const status = await fetchJson("http://127.0.0.1:8000/v1/collector/status");
    const identity = status.collector_build_identity;
    const failures = buildIdentityFailures(identity, {
      component: "collector",
      gitCommit,
      processId: collector.pid,
      processStartTime: collector.startedAt
    });
    if (failures.length) throw new Error(failures.join(","));
    return status;
  }, "collector build identity");
  return { ...identity, collectorIdentity: collectorStatus.collector_build_identity };
}

async function stopAll(evaluations) {
  const plan = safeStopPlan(evaluations);
  if (plan.blocked.length) {
    throw new Error(`Safety block: ${plan.blocked.map((item) => `${item.service}:${item.state}`).join(", ")}`);
  }
  for (const service of plan.staleServices) {
    const spec = specs.find((item) => item.service === service);
    const manifest = readManifest(service);
    if (!manifestMatchesSpec(manifest, spec)) throw new Error(`Refusing to remove invalid ${service} PID file.`);
    unlinkSync(manifestPath(service));
  }
  for (const evaluation of evaluations.filter((item) => item.state === "running")) {
    await stopService(specs.find((item) => item.service === evaluation.service), evaluation);
  }
}

async function cleanStart({ includeCollector = true } = {}) {
  const before = snapshot();
  printStatus(before);
  await stopAll(before);
  const cleared = snapshot();
  const blocked = safeStopPlan(cleared).blocked;
  if (blocked.length || cleared.some((item) => item.state !== "stopped")) {
    throw new Error(`Services were not safely cleared: ${cleared.map((item) => `${item.service}:${item.state}`).join(", ")}`);
  }
  const gitCommit = currentGitIdentity();
  const started = [];
  try {
    const api = startService(specs.find((item) => item.service === "api"), gitCommit);
    started.push(api);
    await verifyApiIdentity(api, gitCommit);
    started.push(startService(specs.find((item) => item.service === "web"), gitCommit));
    if (includeCollector) {
      started.push(startService(specs.find((item) => item.service === "collector"), gitCommit));
    }
    const identity = includeCollector
      ? await verifyStarted(started, gitCommit)
      : await verifyAppStarted(started, gitCommit);
    console.log(`${includeCollector ? "clean-start" : "app-start"} verified ${APPLICATION_VERSION} build ${BUILD_NUMBER} (${gitCommit})`);
    console.log(JSON.stringify(identity, null, 2));
  } catch (error) {
    await stopAll(snapshot());
    throw error;
  }
}

async function main() {
  if (process.platform !== "win32") throw new Error("LapSignal managed development services require Windows.");
  const command = process.argv[2] ?? "status";
  if (command === "status") {
    printStatus(snapshot());
    return;
  }
  if (command === "stop") {
    const release = acquireManagerLock();
    try {
      const current = snapshot();
      printStatus(current);
      await stopAll(current);
      printStatus(snapshot());
    } finally {
      release();
    }
    return;
  }
  if (command === "clean-start") {
    const release = acquireManagerLock();
    try {
      await cleanStart();
    } finally {
      release();
    }
    return;
  }
  if (command === "app-start") {
    const release = acquireManagerLock();
    try {
      await cleanStart({ includeCollector: false });
    } finally {
      release();
    }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
