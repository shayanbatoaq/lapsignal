import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { Logo, SignalMark } from "@/components/Logo";

afterEach(cleanup);

describe("LapSignal brand contract", () => {
  it("renders the approved horizontal and symbol assets without changing their aspect ratio", () => {
    const { rerender } = render(<Logo href={null} variant="dark" size={168} />);
    const horizontal = screen.getByRole("img", { name: "LapSignal" });
    expect(horizontal).toHaveAttribute("src", expect.stringContaining("lapsignal-horizontal-transparent.png"));
    expect(horizontal).toHaveStyle({ width: "168px", height: "auto" });

    rerender(<SignalMark size={44} />);
    const symbol = screen.getByRole("img", { name: "LapSignal symbol" });
    expect(symbol).toHaveAttribute("src", expect.stringContaining("lapsignal-symbol-transparent.png"));
    expect(symbol).toHaveAttribute("data-logo-variant", "symbol");
  });

  it("keeps linked and decorative logos from repeating accessible names", () => {
    const { rerender } = render(<Logo href="/app" />);
    expect(screen.getByRole("link", { name: "LapSignal home" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(<SignalMark decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("discloses the approved full-colour fallback when monochrome masters are unavailable", () => {
    render(<Logo href={null} variant="monochrome" />);
    expect(screen.getByRole("img", { name: "LapSignal" })).toHaveAttribute("data-monochrome-fallback", "true");
  });

  it("publishes complete PWA icon and brand-colour metadata", () => {
    const value = manifest();
    expect(value.start_url).toBe("/app");
    expect(value.background_color).toBe("#080A0D");
    expect(value.theme_color).toBe("#080A0D");
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" })
    ]));
  });
});
