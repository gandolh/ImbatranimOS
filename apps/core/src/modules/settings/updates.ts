/** A nixpkgs pin as the Updates section shows it. */
export type PinView = { release: string; snapshot: string; commit: string };

/** The jobs this section starts; the Linux apps section shows the others. */
export const UPDATE_ACTIONS = new Set(["check", "update", "upgrade", "go-back"]);

/** `nixos-26.05` → `NixOS 26.05`. */
export function releaseName(release: string): string {
  return release.replace(/^nixos-/, "NixOS ");
}

/** `nixos-26.05.13627.c56a87d8e41c` → `build 13627 (c56a87d8)`. */
export function buildName(pin: PinView): string {
  const build = /\.(\d+)\.[0-9a-f]+$/.exec(pin.snapshot)?.[1];
  return `${build ? `build ${build} ` : ""}(${pin.commit.slice(0, 8)})`;
}
