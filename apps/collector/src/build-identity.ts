import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PROCESS_START_TIME = new Date().toISOString();
const versions = JSON.parse(readFileSync(new URL("../../../versions.json", import.meta.url), "utf8")) as {
  product: string;
  build: number;
};

function gitCommit(): string {
  if (process.env.LAPSIGNAL_GIT_COMMIT) return process.env.LAPSIGNAL_GIT_COMMIT;
  try {
    execFileSync("git", ["-C", REPO_ROOT, "diff-index", "--quiet", "HEAD", "--"], {
      stdio: "ignore",
      windowsHide: true
    });
    return execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    }).trim() || "uncommitted";
  } catch {
    return "uncommitted";
  }
}

export function collectorBuildIdentity() {
  return {
    component: "collector" as const,
    application_version: versions.product,
    build_number: versions.build,
    git_commit: gitCommit(),
    process_id: process.pid,
    process_start_time: process.env.LAPSIGNAL_PROCESS_START_TIME ?? PROCESS_START_TIME
  };
}
