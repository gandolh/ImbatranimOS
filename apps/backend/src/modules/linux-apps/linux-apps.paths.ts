import { dirname, join } from "path";

/**
 * Where the Linux apps pane finds things. The image sets `NIX_STATE_HOME`
 * (infrastructure/Dockerfile); the index and the pin are baked in by
 * infrastructure/nix/setup-image.sh. Read once, from the environment, so a
 * test can point them elsewhere.
 */
export interface LinuxAppsPaths {
  /** `packages.json.br` and `git-revision` of the pinned snapshot. */
  indexDir: string;
  /** The pin, as installed into the image. */
  pinFile: string;
  /** The user's Nix profile: what Start lists apps from. */
  profile: string;
  /** The compact index, on the /nix volume so Backup never sees it. */
  cacheDir: string;
  /** The store, whose size the pane shows. */
  store: string;
  /**
   * Xwayland's own profile, for X11 apps. It comes with the first app that
   * speaks X11 and goes with the last (`xwayland.ts`).
   */
  xwaylandProfile: string;
}

export function linuxAppsPaths(env: NodeJS.ProcessEnv = process.env): LinuxAppsPaths | null {
  const state = env.NIX_STATE_HOME?.trim();
  if (!state) return null;
  return {
    indexDir: env.LINUX_APPS_INDEX_DIR?.trim() || "/usr/share/imbatranim/nix",
    pinFile: env.LINUX_APPS_PIN_FILE?.trim() || "/etc/nix/nixpkgs-pin.env",
    profile: join(state, "profile"),
    cacheDir: join(dirname(state), "linux-apps"),
    store: env.LINUX_APPS_STORE?.trim() || "/nix/store",
    xwaylandProfile: join(state, "profiles", "imbatranim-xwayland"),
  };
}

/**
 * The Updates page's record of the pin it moved (pins.ts), on the /nix
 * volume beside the compact index.
 */
export function pinStateFile(paths: LinuxAppsPaths): string {
  return join(paths.cacheDir, "pins.json");
}

/** A moved pin's `packages.json.br` and `git-revision`, as the image keeps its own. */
export function pinIndexDir(paths: LinuxAppsPaths, commit: string): string {
  return join(paths.cacheDir, "pins", commit);
}

/** The Xwayland the Wayland host starts, when its profile is installed. */
export function xwaylandBinary(paths: LinuxAppsPaths): string {
  return join(paths.xwaylandProfile, "bin", "Xwayland");
}

/** `KEY=value` lines, as `nixpkgs-pin.env` holds them. */
export function parsePin(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
