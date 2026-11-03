import { dirname, join } from 'path';

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
}

export function linuxAppsPaths(
  env: NodeJS.ProcessEnv = process.env,
): LinuxAppsPaths | null {
  const state = env.NIX_STATE_HOME?.trim();
  if (!state) return null;
  return {
    indexDir: env.LINUX_APPS_INDEX_DIR?.trim() || '/usr/share/imbatranim/nix',
    pinFile: env.LINUX_APPS_PIN_FILE?.trim() || '/etc/nix/nixpkgs-pin.env',
    profile: join(state, 'profile'),
    cacheDir: join(dirname(state), 'linux-apps'),
    store: env.LINUX_APPS_STORE?.trim() || '/nix/store',
  };
}

/** `KEY=value` lines, as `nixpkgs-pin.env` holds them. */
export function parsePin(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
