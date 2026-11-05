import { basename } from 'path';

/**
 * Whether a closure (`nix path-info --recursive` output, one store path a
 * line) holds libX11: an app in it can speak X11, so it may need Xwayland.
 * Toolkit apps that also speak Wayland (Firefox, GTK, Qt) hold it too, and
 * for them Xwayland adds little, since its own closure is mostly theirs.
 */
export function closureSpeaksX11(pathInfo: string): boolean {
  return pathInfo
    .split('\n')
    .some((line) => /^[0-9a-z]{32}-libx11-\d/i.test(basename(line.trim())));
}
