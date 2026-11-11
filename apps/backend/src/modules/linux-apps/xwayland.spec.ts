import { closureSpeaksX11 } from "./xwayland";

describe("closureSpeaksX11", () => {
  it("finds libX11 in a closure, by its store name", () => {
    const xterm = [
      "/nix/store/0d4kfdqyigyldxkwd9jh9x9al5m7jhah-xterm-404",
      "/nix/store/aaay1yrfqyhkpgq97d11gw4i35992q83-libx11-1.8.14",
      "",
    ].join("\n");
    expect(closureSpeaksX11(xterm)).toBe(true);
  });

  it("is false for a Wayland-only closure and for look-alike names", () => {
    const foot = [
      "/nix/store/5v61f4vqd8f1j9ad0c0k3sniwcqf4xq3-wayland-1.25.0",
      "/nix/store/0d4kfdqyigyldxkwd9jh9x9al5m7jhah-foot-1.25.0",
      "/nix/store/0d4kfdqyigyldxkwd9jh9x9al5m7jhah-libx11-docs",
    ].join("\n");
    expect(closureSpeaksX11(foot)).toBe(false);
    expect(closureSpeaksX11("")).toBe(false);
  });
});
