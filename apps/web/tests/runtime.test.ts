import { afterEach, describe, expect, it } from "vitest";
import { resolveRuntimeMode } from "@/lib/runtime";
import { getDataProvider } from "@/lib/data-provider";

const original = process.env.LAPSIGNAL_SHOWCASE;
afterEach(() => { if (original === undefined) delete process.env.LAPSIGNAL_SHOWCASE; else process.env.LAPSIGNAL_SHOWCASE = original; });

describe("runtime selection", () => {
  it.each([["true", "showcase"], [undefined, "local"], ["false", "local"], ["TRUE", "local"], ["1", "local"]] as const)("maps %s to %s", (value, expected) => expect(resolveRuntimeMode(value)).toBe(expected));
  it("selects showcase only through the server contract", () => { process.env.LAPSIGNAL_SHOWCASE = "true"; expect(getDataProvider().mode).toBe("showcase"); });
  it("never uses showcase as a local request fallback", () => { process.env.LAPSIGNAL_SHOWCASE = "true"; const request = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch; expect(getDataProvider(request).mode).toBe("local"); });
});
