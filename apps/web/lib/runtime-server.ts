import "server-only";
import { resolveRuntimeMode } from "./runtime";

export function getRuntimeMode() {
  return resolveRuntimeMode(process.env.LAPSIGNAL_SHOWCASE);
}

export function isShowcaseMode() {
  return getRuntimeMode() === "showcase";
}
