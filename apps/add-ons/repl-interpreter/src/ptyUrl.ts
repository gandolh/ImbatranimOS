import { desktopSessionId } from "@imbatranim/ui";

/** Where a new Terminal's shell starts: an absolute folder, or a folder in one of Files' roots. */
export type StartFolder = { cwd: string } | { root: string; path: string };

/**
 * The start folder a launch payload names (`{ cwd }` from a Terminal, `{ root, path }` from Files), or null.
 * Only its shape is checked here; the gateway decides whether the folder will do.
 */
export function startFolderFrom(payload: unknown): StartFolder | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as { cwd?: unknown; root?: unknown; path?: unknown };
  if (typeof p.cwd === "string" && p.cwd.startsWith("/")) return { cwd: p.cwd };
  if (typeof p.root === "string" && p.root !== "")
    return { root: p.root, path: typeof p.path === "string" ? p.path : "" };
  return null;
}

/**
 * Build the terminal WebSocket URL for both dev and prod.
 *
 *  - dev:  Vite (:5173) and the API (:3001) are separate origins. The axios
 *          base URL `VITE_API_URL` (e.g. `http://localhost:3001/api`) tells us
 *          where the API lives; we reuse its host + path and swap the scheme
 *          to `ws`/`wss`, then append `/pty`.
 *  - prod: `VITE_API_URL` is unset — everything is same-origin, so derive the
 *          socket URL from `window.location`.
 *
 * `cols`/`rows` are passed as a query hint so the pty spawns at the right
 * geometry before the first resize frame arrives.
 *
 * `shell` names the window's shell: `shell=<token>` starts it, `resume=<token>`
 * comes back to it after a reload or a drop (the gateway keeps a shell whose
 * socket ended without the window closing for 30 s).
 *
 * `start` names the folder a new shell starts in: an absolute `cwd`, or a
 * Files `root` and a `path` in it. The gateway checks it and falls back to the
 * home folder.
 */
export function buildPtyUrl(
  cols: number,
  rows: number,
  shell?: { token: string; resume: boolean },
  start?: StartFolder | null,
): string {
  // The desktop session (this tab) goes along so the shell's WAYLAND_DISPLAY
  // names this tab's socket: a Linux app started here opens its windows here.
  const named = shell ? `&${shell.resume ? "resume" : "shell"}=${encodeURIComponent(shell.token)}` : "";
  const folder = !start
    ? ""
    : "cwd" in start
      ? `&cwd=${encodeURIComponent(start.cwd)}`
      : `&root=${encodeURIComponent(start.root)}&path=${encodeURIComponent(start.path)}`;
  const query = `?cols=${cols}&rows=${rows}&session=${encodeURIComponent(desktopSessionId())}${named}${folder}`;
  const base = import.meta.env.VITE_API_URL as string | undefined;

  if (base) {
    const u = new URL(base, window.location.href);
    const scheme = u.protocol === "https:" ? "wss:" : "ws:";
    const path = u.pathname.replace(/\/+$/, ""); // strip trailing slash
    return `${scheme}//${u.host}${path}/pty${query}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/api/pty${query}`;
}
