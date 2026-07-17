import { homedir, userInfo } from 'os';

/**
 * Path the terminal WebSocket listens on. Lives under the `/api` prefix so it
 * shares the same origin/proxy story as REST and is caught by any `/api/*`
 * reverse-proxy rule. Note: `setGlobalPrefix('api')` only affects Nest's HTTP
 * routes — a raw `ws` upgrade handler sees the untouched request URL, so we
 * match this literal path ourselves.
 */
export const PTY_PATH = '/api/pty';

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
  return '/bin/sh';
}

/** Home directory to start the shell in, with a safe fallback. */
export function resolveHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME?.trim() || homedir() || process.cwd();
}
