import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const APPLICATION_VERSION = "0.1.0-alpha.4";
export const BUILD_NUMBER = 4;
export const AI_SCHEMA_HASH = "1f7791fed1421e1d0810f9155a273a8807980145649caf89deb3494e3bd3f715";
export const DIAGNOSTICS_CONTRACT_VERSION = "3";

function comparablePath(value) {
  return resolve(String(value)).replaceAll("/", "\\").toLowerCase();
}

function comparableText(value) {
  return String(value ?? "").replaceAll("/", "\\").toLowerCase();
}

function isDescendantOf(processId, ancestorPid, processes) {
  let current = processes.find((item) => Number(item.processId) === Number(processId));
  const seen = new Set();
  while (current && !seen.has(Number(current.processId))) {
    if (Number(current.parentProcessId) === Number(ancestorPid)) return true;
    seen.add(Number(current.processId));
    current = processes.find(
      (item) => Number(item.processId) === Number(current.parentProcessId)
    );
  }
  return false;
}

function stableSpec(spec) {
  return {
    service: spec.service,
    executable: comparablePath(spec.executable),
    arguments: spec.arguments.map(String),
    working_directory: comparablePath(spec.workingDirectory),
    ports: spec.ports
  };
}

export function serviceFingerprint(spec) {
  return createHash("sha256").update(JSON.stringify(stableSpec(spec))).digest("hex");
}

export function manifestMatchesSpec(manifest, spec) {
  return Boolean(
    manifest &&
      manifest.schema_version === 1 &&
      manifest.service === spec.service &&
      Number.isInteger(manifest.pid) &&
      manifest.pid > 0 &&
      comparablePath(manifest.executable) === comparablePath(spec.executable) &&
      comparablePath(manifest.working_directory) === comparablePath(spec.workingDirectory) &&
      JSON.stringify(manifest.arguments) === JSON.stringify(spec.arguments) &&
      manifest.service_fingerprint === serviceFingerprint(spec) &&
      !Number.isNaN(Date.parse(manifest.process_start_time))
  );
}

export function processMatchesService(processRecord, spec) {
  if (!processRecord?.executablePath || !processRecord?.commandLine) return false;
  if (comparablePath(processRecord.executablePath) !== comparablePath(spec.executable)) return false;
  const command = comparableText(processRecord.commandLine);
  return spec.identityMarkers.every((marker) => command.includes(comparableText(marker)));
}

export function processMatchesManifest(processRecord, manifest, spec) {
  if (!manifestMatchesSpec(manifest, spec)) return false;
  if (Number(processRecord?.processId) !== manifest.pid) return false;
  if (!processMatchesService(processRecord, spec)) return false;
  const actualStart = Date.parse(processRecord.creationDate ?? "");
  const recordedStart = Date.parse(manifest.process_start_time);
  return Number.isFinite(actualStart) && Math.abs(actualStart - recordedStart) <= 10_000;
}

export function portOwnerMatchesManifest(ownerPid, manifest, spec, processes) {
  if (Number(ownerPid) === Number(manifest?.pid)) return true;
  const owner = processes.find((item) => Number(item.processId) === Number(ownerPid));
  if (!owner || !isDescendantOf(ownerPid, manifest.pid, processes)) return false;
  const executableAllowed = (spec.portOwnerExecutables ?? [spec.executable]).some(
    (value) => comparablePath(value) === comparablePath(owner.executablePath)
  );
  const command = comparableText(owner.commandLine);
  return (
    executableAllowed &&
    spec.identityMarkers.every((marker) => command.includes(comparableText(marker)))
  );
}

export function evaluateService(spec, manifest, processes, portOwners = []) {
  const processForPid = manifest
    ? processes.find((item) => Number(item.processId) === Number(manifest.pid))
    : undefined;
  const matches = processes.filter((item) => processMatchesService(item, spec));
  const owners = portOwners.filter((owner) =>
    spec.ports.some((port) => port.protocol === owner.protocol && port.port === owner.port)
  );
  if (manifest && !manifestMatchesSpec(manifest, spec)) {
    return { service: spec.service, state: "invalid_pid_file", owned: false, matches, owners };
  }
  if (manifest && !processForPid) {
    return { service: spec.service, state: "stale_pid_file", owned: false, matches, owners };
  }
  if (manifest && processForPid && !processMatchesManifest(processForPid, manifest, spec)) {
    return { service: spec.service, state: "pid_identity_mismatch", owned: false, matches, owners };
  }
  if (matches.length > 1) {
    return { service: spec.service, state: "duplicate_instances", owned: false, matches, owners };
  }
  if (manifest && processForPid) {
    const unexpectedOwner = owners.find(
      (owner) => !portOwnerMatchesManifest(owner.processId, manifest, spec, processes)
    );
    if (unexpectedOwner) {
      return { service: spec.service, state: "port_owned_by_other_process", owned: false, matches, owners };
    }
    return {
      service: spec.service,
      state: "running",
      owned: true,
      pid: manifest.pid,
      matches,
      owners
    };
  }
  if (matches.length === 1) {
    return { service: spec.service, state: "unmanaged_lapsignal_process", owned: false, matches, owners };
  }
  if (owners.length) {
    return { service: spec.service, state: "port_owned_by_other_process", owned: false, matches, owners };
  }
  return { service: spec.service, state: "stopped", owned: false, matches, owners };
}

export function safeStopPlan(evaluations) {
  return {
    pids: evaluations.filter((item) => item.state === "running" && item.owned).map((item) => item.pid),
    staleServices: evaluations.filter((item) => item.state === "stale_pid_file").map((item) => item.service),
    blocked: evaluations.filter((item) =>
      [
        "invalid_pid_file",
        "pid_identity_mismatch",
        "duplicate_instances",
        "unmanaged_lapsignal_process",
        "port_owned_by_other_process"
      ].includes(item.state)
    )
  };
}

export function buildIdentityFailures(identity, expected) {
  const failures = [];
  if (!identity || identity.component !== expected.component) failures.push("component_mismatch");
  if (identity?.application_version !== APPLICATION_VERSION) failures.push("application_version_mismatch");
  if (identity?.build_number !== BUILD_NUMBER) failures.push("build_number_mismatch");
  if (identity?.git_commit !== expected.gitCommit) failures.push("git_commit_mismatch");
  if (identity?.process_id !== expected.processId) failures.push("process_id_mismatch");
  if (
    expected.processStartTime &&
    Date.parse(identity?.process_start_time ?? "") !== Date.parse(expected.processStartTime)
  ) {
    failures.push("process_start_time_mismatch");
  }
  if (expected.component === "api") {
    if (identity?.ai_contract_schema_hash !== AI_SCHEMA_HASH) failures.push("schema_hash_mismatch");
    if (identity?.cloud_ai_guard_active !== true) failures.push("cloud_ai_guard_inactive");
    if (identity?.cloud_ai_enabled !== false) failures.push("cloud_ai_not_disabled");
    if (identity?.ai_provider !== "openrouter") failures.push("ai_provider_mismatch");
    if (identity?.ai_provider_configured !== true) failures.push("ai_provider_not_configured");
    if (identity?.ai_endpoint_family !== "direct_openai") failures.push("endpoint_family_mismatch");
    if (identity?.diagnostics_contract_version !== DIAGNOSTICS_CONTRACT_VERSION) {
      failures.push("diagnostics_contract_mismatch");
    }
  }
  return failures;
}
