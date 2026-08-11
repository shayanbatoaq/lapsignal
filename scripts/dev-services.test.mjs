import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_SCHEMA_HASH,
  APPLICATION_VERSION,
  BUILD_NUMBER,
  buildIdentityFailures,
  evaluateService,
  manifestMatchesSpec,
  safeStopPlan,
  serviceFingerprint
} from "./dev-services-lib.mjs";

const spec = {
  service: "api",
  executable: "C:/repo/services/api/.venv/Scripts/python.exe",
  arguments: ["-m", "uvicorn", "lapsignal.main:app", "--port", "8000"],
  workingDirectory: "C:/repo/services/api",
  identityMarkers: ["uvicorn", "lapsignal.main:app", "8000"],
  ports: [{ protocol: "tcp", port: 8000 }]
};

function manifest(pid = 100, start = "2026-08-11T00:00:00.000Z") {
  return {
    schema_version: 1,
    service: spec.service,
    pid,
    executable: spec.executable,
    arguments: spec.arguments,
    working_directory: spec.workingDirectory,
    process_start_time: start,
    service_fingerprint: serviceFingerprint(spec)
  };
}

function processRecord(pid = 100, commandLine = `${spec.executable} -m uvicorn lapsignal.main:app --port 8000`) {
  return {
    processId: pid,
    executablePath: spec.executable,
    commandLine,
    creationDate: "2026-08-11T00:00:01.000Z"
  };
}

test("validated stale PID files are classified without selecting a process", () => {
  const result = evaluateService(spec, manifest(), [], []);
  assert.equal(result.state, "stale_pid_file");
  assert.deepEqual(safeStopPlan([result]).pids, []);
  assert.deepEqual(safeStopPlan([result]).staleServices, ["api"]);
});

test("two API instances block stop and start", () => {
  const result = evaluateService(spec, manifest(), [processRecord(), processRecord(101)], []);
  assert.equal(result.state, "duplicate_instances");
  assert.equal(safeStopPlan([result]).blocked.length, 1);
});

test("an unrelated process occupying port 8000 is never selected for shutdown", () => {
  const result = evaluateService(spec, null, [{ ...processRecord(900), executablePath: "C:/other/python.exe", commandLine: "other-server" }], [{ protocol: "tcp", port: 8000, processId: 900 }]);
  const plan = safeStopPlan([result]);
  assert.equal(result.state, "port_owned_by_other_process");
  assert.deepEqual(plan.pids, []);
  assert.equal(plan.blocked.length, 1);
});

test("a reused PID cannot pass executable, command line, and start-time checks", () => {
  const result = evaluateService(spec, manifest(), [{ ...processRecord(), executablePath: "C:/other/python.exe" }], []);
  assert.equal(result.state, "pid_identity_mismatch");
  assert.deepEqual(safeStopPlan([result]).pids, []);
});

test("only a verified manifest-backed LapSignal process enters the stop plan", () => {
  const record = processRecord();
  const result = evaluateService(spec, manifest(), [record, { ...record, processId: 777, executablePath: "C:/other.exe", commandLine: "unrelated" }], [{ protocol: "tcp", port: 8000, processId: 100 }]);
  assert.equal(manifestMatchesSpec(manifest(), spec), true);
  assert.deepEqual(safeStopPlan([result]).pids, [100]);
});

test("a verified Windows venv child may own the API port without becoming a second instance", () => {
  const apiSpec = {
    ...spec,
    portOwnerExecutables: [spec.executable, "C:/python/base/python.exe"]
  };
  const root = processRecord();
  const worker = {
    processId: 200,
    parentProcessId: 100,
    executablePath: "C:/python/base/python.exe",
    commandLine: "python -m uvicorn lapsignal.main:app --port 8000",
    creationDate: "2026-08-11T00:00:01.000Z"
  };
  const result = evaluateService(
    apiSpec,
    { ...manifest(), service_fingerprint: serviceFingerprint(apiSpec) },
    [root, worker],
    [{ protocol: "tcp", port: 8000, processId: 200 }]
  );
  assert.equal(result.state, "running");
  assert.equal(result.owned, true);
});

test("old builds, schema mismatches, and missing Cloud-AI guards fail identity verification", () => {
  const base = { component: "api", application_version: APPLICATION_VERSION, build_number: BUILD_NUMBER, git_commit: "abc", process_id: 100, ai_contract_schema_hash: AI_SCHEMA_HASH, cloud_ai_guard_active: true, cloud_ai_enabled: false, ai_provider: "openrouter", ai_provider_configured: true, ai_endpoint_family: "direct_openai", diagnostics_contract_version: "3" };
  assert.deepEqual(buildIdentityFailures(base, { component: "api", gitCommit: "abc", processId: 100 }), []);
  assert.ok(buildIdentityFailures({ ...base, application_version: "0.1.0-alpha.2" }, { component: "api", gitCommit: "abc", processId: 100 }).includes("application_version_mismatch"));
  assert.ok(buildIdentityFailures({ ...base, ai_contract_schema_hash: "old" }, { component: "api", gitCommit: "abc", processId: 100 }).includes("schema_hash_mismatch"));
  assert.ok(buildIdentityFailures({ ...base, cloud_ai_guard_active: false }, { component: "api", gitCommit: "abc", processId: 100 }).includes("cloud_ai_guard_inactive"));
});
