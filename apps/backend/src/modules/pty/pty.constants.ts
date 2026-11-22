import { homedir, userInfo } from "os";
import { constants as fsConstants } from "fs";
import { access, stat } from "fs/promises";
import { isAbsolute } from "path";
import { isValidSessionId } from "../wayland/wayland.protocol";
import { sessionBusAddress } from "../linux-apps/session-bus.paths";
import { soundServerEnv } from "../linux-apps/sound-server.paths";

/**
 * Path the terminal WebSocket listens on. Lives under the `/api` prefix so it
 * shares the same origin/proxy story as REST and is caught by any `/api/*`
 * reverse-proxy rule. Note: `setGlobalPrefix('api')` only affects Nest's HTTP
 * routes — a raw `ws` upgrade handler sees the untouched request URL, so we
 * match this literal path ourselves.
 */
export const PTY_PATH = "/api/pty";

/** xterm-side scrollback is capped too; this is the pty geometry default. */
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;

/** Upper bounds on terminal geometry — a client can't request more than this. */
export const MAX_COLS = 1000;
export const MAX_ROWS = 1000;

/**
 * Max concurrent terminal sessions. Each accepted upgrade spawns a real login
 * shell, so this caps fork/PID/memory blast radius from a client (or hijacked
 * session) opening sockets in a loop. Single-user appliance — a handful of
 * open terminals is generous.
 */
export const MAX_SESSIONS = 12;

/**
 * Socket send-buffer thresholds (bytes). When a program floods stdout (think
 * `yes`) faster than the socket drains, we pause the pty at HIGH_WATER and
 * resume once the buffer falls back below LOW_WATER — classic backpressure so
 * one runaway command can't OOM the server or wedge the tab.
 */
export const BACKPRESSURE_HIGH_WATER = 1024 * 1024; // 1 MiB buffered → pause
export const BACKPRESSURE_LOW_WATER = 256 * 1024; // drained below → resume
export const BACKPRESSURE_POLL_MS = 50;

/**
 * How long a shell whose socket closed without the tab's `close` frame waits for the tab to come back: a
 * reload, a dropped network, a backgrounded phone tab. After it the shell is hung up as a closed window's
 * is (decisions-terminal.md, 2026-11-20).
 */
export const DETACH_MS = 30_000;

/**
 * What a shell keeps of its latest output, attached or not: the last 256 KiB. A detached shell is read into it,
 * so a busy command doesn't stall on a full pty, and a tab that comes back gets its recent screen from it.
 */
export const RING_BYTES = 256 * 1024;

/** What the Terminal calls itself in `TERM_PROGRAM`, which the image's bash integration checks. */
export const TERM_PROGRAM = "imbatranim";

/** The close code a second tab gets for a shell another tab's socket still holds. */
export const CLOSE_SHELL_ATTACHED = 4409;

/**
 * How long a tab coming back waits for the socket the server still holds to answer a ping. No pong means that
 * socket is half-open (the tab is the one coming back), so the shell is handed over.
 */
export const RESUME_PROBE_MS = 2_000;

/**
 * Names the shell a Terminal window keeps across a reload: the tab makes one (a UUID) and the window keeps
 * it. Anything else names no shell, and that socket's shell ends with it as before.
 */
export function isShellToken(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/**
 * The login shell to spawn, as the CURRENT process user (in the container
 * that's `imbatranim`; locally it's the dev user). We never hardcode a
 * username — node-pty inherits the process uid/gid. Falls back to `/bin/sh`
 * when `$SHELL` is unset (minimal images).
 */
export function resolveShell(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.SHELL?.trim();
  if (fromEnv) return fromEnv;
  try {
    const info = userInfo();
    if (info.shell && info.shell.trim()) return info.shell;
  } catch {
    /* userInfo can throw on some platforms; fall through */
  }
  return "/bin/sh";
}

/** Home directory to start the shell in, with a safe fallback. */
export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME?.trim() || homedir() || process.cwd();
}

/**
 * The folder a new shell starts in: `requested` when it is an absolute path with no control characters that
 * names a directory the shell user can enter, else `home`. The shell runs as that user anyway, so this
 * catches mistakes (a file, a typo, a stale folder), not access.
 */
export async function startDirectory(requested: string | null | undefined, home: string): Promise<string> {
  // eslint-disable-next-line no-control-regex -- control characters are what is refused
  if (!requested || !isAbsolute(requested) || /[\u0000-\u001f\u007f]/.test(requested)) return home;
  try {
    if (!(await stat(requested)).isDirectory()) return home;
    await access(requested, fsConstants.X_OK);
    return requested;
  } catch {
    return home;
  }
}

/**
 * The environment a Terminal shell starts with: `base` (the backend's
 * environment minus its secrets) plus the user's Nix profile at the front of
 * `PATH`, so a Linux app installed with `nix profile add` runs by name, and
 * `WAYLAND_DISPLAY` naming the socket of the desktop session (the tab) the
 * Terminal is in, so a Linux app started here shows its windows in that tab,
 * `DISPLAY` naming the X display that session reserved (`x11Display`), so an
 * X11 app does too, through Xwayland, `DBUS_SESSION_BUS_ADDRESS` naming
 * that session's bus, and `PULSE_SERVER` its sound server, so the app's sound
 * plays in that tab. An invalid or missing session id adds none of them.
 *
 * The profile goes on the shell's `PATH` only, never the backend's: the
 * backend runs `git` and `tar` by name, and a Nix-installed copy of either must
 * not replace the one the image ships. The other variables Nix apps need
 * (`LOCALE_ARCHIVE`, `FONTCONFIG_FILE`, `XDG_DATA_DIRS`, `XDG_RUNTIME_DIR`)
 * come from the image's environment and pass through `base` unchanged.
 * Outside the container `NIX_STATE_HOME` is unset and nothing is added.
 *
 * `TERM_PROGRAM=imbatranim` (and `TERM_PROGRAM_VERSION`, the OS's version, when known) names the terminal,
 * as Ghostty, VS Code and iTerm2 name theirs: the image's bash integration runs only where it is set, so a
 * Linux app's own terminal and scripts never run it.
 */
export function terminalEnv(
  base: NodeJS.ProcessEnv,
  desktopSession?: string | null,
  x11Display?: number | null,
  version?: string,
): NodeJS.ProcessEnv {
  const env = { ...base };
  env.TERM_PROGRAM = TERM_PROGRAM;
  if (version && version !== "unknown") env.TERM_PROGRAM_VERSION = version;
  else delete env.TERM_PROGRAM_VERSION;
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  delete env.DISPLAY;
  if (desktopSession && isValidSessionId(desktopSession)) {
    env.WAYLAND_DISPLAY = `wayland-${desktopSession}`;
    if (typeof x11Display === "number" && Number.isInteger(x11Display) && x11Display >= 0) {
      env.DISPLAY = `:${x11Display}`;
    }
    // The session's own bus: apps keep one instance and talk to the OS on it.
    if (runtimeDir) {
      env.DBUS_SESSION_BUS_ADDRESS = sessionBusAddress(runtimeDir, desktopSession);
      Object.assign(env, soundServerEnv(runtimeDir, desktopSession));
    }
  } else {
    delete env.WAYLAND_DISPLAY;
    delete env.DBUS_SESSION_BUS_ADDRESS;
    delete env.PULSE_SERVER;
    delete env.PULSE_COOKIE;
  }
  const stateHome = env.NIX_STATE_HOME?.trim();
  if (stateHome) {
    const profileBin = `${stateHome}/profile/bin`;
    const parts = (env.PATH ?? "").split(":").filter((p) => p !== "");
    if (!parts.includes(profileBin)) {
      env.PATH = [profileBin, ...parts].join(":");
    }
  }
  return env;
}
