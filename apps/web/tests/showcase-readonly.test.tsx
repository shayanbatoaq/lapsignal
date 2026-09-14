import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "@/app/app/settings/SettingsView";
import { LiveStatusProvider } from "@/components/LiveStatus";

describe("showcase read-only boundary", () => {
  it("does not fetch or open a WebSocket when showcase context mounts", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    const socket = vi.spyOn(globalThis, "WebSocket");
    render(<LiveStatusProvider mode="showcase"><div>preview child</div></LiveStatusProvider>);
    expect(await screen.findByText("preview child")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    request.mockRestore(); socket.mockRestore();
  });

  it("renders disabled settings without local service requests", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    render(<SettingsView readOnly/>);
    expect(await screen.findByText(/Physical telemetry is not collected/i)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").every((control) => control.hasAttribute("disabled"))).toBe(true);
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });
});
