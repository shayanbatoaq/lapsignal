export type RuntimeMode = "local" | "showcase";

export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  return value === "true" ? "showcase" : "local";
}
