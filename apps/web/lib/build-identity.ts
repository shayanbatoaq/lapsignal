import "server-only";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROCESS_START_TIME = new Date().toISOString();

function repositoryRoot(): string {
  return resolve(process.cwd(), "../..");
}

function gitCommit(root: string): string {
  if (process.env.LAPSIGNAL_GIT_COMMIT) return process.env.LAPSIGNAL_GIT_COMMIT;
  try {
    execFileSync("git", ["-C", root, "diff-index", "--quiet", "HEAD", "--"], {
      stdio: "ignore"
    });
    return execFileSync("git", ["-C", root, "rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || "uncommitted";
  } catch {
    return "uncommitted";
  }
}

export function webBuildIdentity() {
  const root = repositoryRoot();
  const versions = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8")) as {
    product: string;
    build: number;
  };
  return {
    component: "web" as const,
    application_version: versions.product,
    build_number: versions.build,
    git_commit: gitCommit(root),
    process_id: process.pid,
    process_start_time: process.env.LAPSIGNAL_PROCESS_START_TIME ?? PROCESS_START_TIME
  };
}
