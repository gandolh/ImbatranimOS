import { required } from "../../lib/required";
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, type WebSocket } from "ws";
import * as pty from "node-pty";
import type { Env } from "../../config/env.schema";
import { LocalIdentityService } from "../auth/ws-auth";
import { PtySession } from "./pty-session";
import { isPtyUpgrade, authorizeUpgrade } from "./pty-upgrade";
import {
  CLOSE_SHELL_ATTACHED,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DETACH_MS,
  isShellToken,
  MAX_COLS,
  MAX_ROWS,
  MAX_SESSIONS,
  PTY_PATH,
  RESUME_PROBE_MS,
  resolveHome,
  resolveShell,
  terminalEnv,
} from "./pty.constants";
import type { Caller } from "../auth/ws-auth";
import { childEnv } from "../../child-env";
import { UpgradeRoutes } from "../../upgrade-routes";
import { raiseOomScore } from "../linux-apps/oom";
import { osVersion } from "../../lib/os-version";
import { WaylandGateway } from "../wayland/wayland.gateway";

/**
 * How often to re-check that each live terminal's session is still valid, so
 * a sign-out, an expiry or a password change elsewhere closes the shell within
 * this window. Each check is one indexed SQLite read.
 */
const REVOKE_SWEEP_MS = 30_000;

interface LiveSession {
  session: PtySession;
  /**
   * The upgrade's cookie header. The whole header rather than a parsed token:
   * which cookie names the session is `LocalIdentityService`'s business, and a
   * second copy of that knowledge here is how the terminal ends up honouring
   * a session the REST guard refuses.
   */
  cookie: string | undefined;
  /**
   * The sign-in, the desktop session (tab) and the window's shell token, when the tab named its shell: the
   * key a reload or a reconnect finds it by. Null for a socket that named none: its shell ends with it.
   */
  key: string | null;
}

/** The dim line a tab gets when the shell it came back for had already ended. */
const PREVIOUS_ENDED = "\x1b[2m[the previous shell had ended; this is a new one]\x1b[0m\r\n";

/**
 * Terminal WebSocket gateway. Attaches a raw `ws` server to Nest's underlying
 * HTTP server via the `upgrade` event (`noServer: true`) — no change to
 * main.ts required. Every upgrade is authenticated through the shared
 * `LocalIdentityService`, the same check the REST guard uses, before a pty is
 * spawned as the current process user.
 *
 * A Terminal window names its shell with a token it keeps across a reload:
 * `shell=<token>` for a new window, `resume=<token>` coming back. A socket that
 * ends without the tab's `close` frame leaves its shell detached for
 * {@link DETACH_MS}, and a `resume` from the same sign-in and tab within that
 * gets it back. A shell another live socket holds refuses with
 * {@link CLOSE_SHELL_ATTACHED}: a duplicated tab starts its own.
 */
@Injectable()
export class PtyGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PtyGateway.name);
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  /** Every shell, attached or detached: what the cap counts and the revocation sweep checks. */
  private readonly live = new Set<LiveSession>();
  /** The shells a tab named, by {@link LiveSession.key}. */
  private readonly byKey = new Map<string, LiveSession>();
  private revokeTimer: NodeJS.Timeout | null = null;
  private upgradeHandler: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null;
  /** The OS's version, for the shell's `TERM_PROGRAM_VERSION`; read once. */
  private readonly version = osVersion();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly identity: LocalIdentityService,
    private readonly config: ConfigService<Env, true>,
    private readonly upgrades: UpgradeRoutes,
    private readonly wayland: WaylandGateway,
  ) {}

  onApplicationBootstrap(): void {
    // getHttpServer() is typed `any` on the base HttpAdapterHost<AbstractHttpAdapter>
    // generic (TServer defaults to `any`); the concrete adapter Nest wires up
    // here is always the Node http/https server this gateway attaches to.
    const server = this.adapterHost.httpAdapter?.getHttpServer?.() as HttpServer | undefined;
    if (!server) {
      this.logger.error("No HTTP server available; terminal WS not attached");
      return;
    }
    this.httpServer = server;
    this.wss = new WebSocketServer({ noServer: true });

    this.upgradeHandler = (req, socket, head) => {
      // Once any 'upgrade' listener exists, Node stops answering upgrades
      // itself, so an unclaimed one would pin its socket until the peer gave
      // up. Refuse it. Another WebSocket endpoint is dispatched from this
      // handler through UpgradeRoutes, not from a second 'upgrade' listener, or
      // the two would each refuse the other's path.
      if (!isPtyUpgrade(req.url)) {
        const route = this.upgrades.find(req.url);
        if (route) {
          route.handle(req, socket, head);
          return;
        }
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      // Node removes its own socket 'error' listener before emitting
      // 'upgrade'. Without this one, a client that resets the connection while
      // the session is being checked emits ECONNRESET with no listener, which throws and
      // takes the whole backend down. `handleUpgrade` installs its
      // own, so this is removed just before it; the refusals keep it until
      // `destroy()`.
      const onSocketError = (err: Error) => {
        this.logger.debug(`Terminal upgrade socket error: ${err.message}`);
        socket.destroy();
      };
      socket.on("error", onSocketError);

      /*
       * Authorization is asynchronous, so this handler starts a promise rather
       * than deciding inline. The socket is held open meanwhile, which is what
       * an upgrade already does; nothing is spawned until the answer arrives.
       */
      void (async () => {
        const record = await authorizeUpgrade(req, this.identity, this.config.get("FRONTEND_URL"));
        // The client left while the check ran: nothing to refuse and
        // nobody to spawn a shell for.
        if (socket.destroyed) return;
        if (!record) {
          this.logger.warn("Rejected unauthorized terminal upgrade");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Cap concurrent shells so a client can't exhaust PIDs/memory by
        // opening sockets in a loop. Reject the handshake before spawning
        // anything. Detached shells count; coming back to one adds none.
        const named = shellKey(record, req.url);
        if (!(named && this.byKey.has(named.key)) && this.live.size >= MAX_SESSIONS) {
          this.logger.warn(`Terminal session cap reached (${MAX_SESSIONS})`);
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
          socket.destroy();
          return;
        }

        socket.off("error", onSocketError);
        required(this.wss, "the relay server").handleUpgrade(req, socket, head, (ws) => {
          this.onConnection(ws, req, record);
        });
      })();
    };
    server.on("upgrade", this.upgradeHandler);

    this.revokeTimer = setInterval(() => void this.sweepRevoked(), REVOKE_SWEEP_MS);
    this.logger.log(`Terminal WS listening on ${PTY_PATH}`);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage, caller: Caller): void {
    const { cols, rows } = parseGeometry(req.url);
    const desktopSession = queryParam(req.url, "session");
    const named = shellKey(caller, req.url);
    const existing = named ? this.byKey.get(named.key) : undefined;
    if (existing) {
      this.resume(existing, ws, cols, rows);
      return;
    }
    if (this.live.size >= MAX_SESSIONS) {
      // Another upgrade filled the last place while this one was in its handshake.
      ws.close(1013, "session-cap");
      return;
    }
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(resolveShell(), [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: resolveHome(),
        env: terminalEnv(
          childEnv(),
          desktopSession,
          desktopSession ? this.wayland.x11Display(desktopSession) : null,
          this.version,
        ),
      });
      // What the shell starts (Linux apps among it) goes before the
      // backend when memory runs out.
      raiseOomScore(ptyProcess.pid);
    } catch (err) {
      this.logger.error(`Failed to spawn shell: ${(err as Error).message}`);
      try {
        ws.send("\r\n[failed to start shell]\r\n");
      } catch {
        /* noop */
      }
      ws.close(1011, "spawn-failed");
      return;
    }

    if (named?.resuming) {
      try {
        ws.send(PREVIOUS_ENDED);
      } catch {
        /* noop */
      }
    }
    const key = named?.key ?? null;
    const session: PtySession = new PtySession(ptyProcess, ws, {
      // A shell nobody can come back to ends with its socket, as it always has.
      detachMs: key ? DETACH_MS : 0,
      onDispose: () => this.forget(session),
    });
    const entry: LiveSession = { session, cookie: req.headers.cookie, key };
    this.live.add(entry);
    if (key) this.byKey.set(key, entry);
    this.logger.log(`Terminal opened (${this.live.size} live)`);
  }

  /**
   * A tab comes back for its shell. Detached: it attaches. Held by a socket that still answers: that is another
   * tab, refused with {@link CLOSE_SHELL_ATTACHED}. Held by one that doesn't: a half-open connection the tab left
   * behind, dropped, and the shell attaches.
   */
  private resume(entry: LiveSession, ws: WebSocket, cols: number, rows: number): void {
    const attach = (): void => {
      if (ws.readyState !== ws.OPEN) return;
      if (!entry.session.attach(ws)) {
        // It ended while the probe ran: the tab starts afresh.
        ws.close(CLOSE_SHELL_ATTACHED, "shell-attached");
        return;
      }
      entry.session.resize(cols, rows);
      this.logger.log(`Terminal reattached (${this.live.size} live)`);
    };
    if (!entry.session.attached) {
      attach();
      return;
    }
    void entry.session.probe(RESUME_PROBE_MS).then((held) => {
      if (held) {
        ws.close(CLOSE_SHELL_ATTACHED, "shell-attached");
        return;
      }
      attach();
    });
  }

  private forget(session: PtySession): void {
    for (const entry of this.live) {
      if (entry.session !== session) continue;
      this.live.delete(entry);
      if (entry.key && this.byKey.get(entry.key) === entry) this.byKey.delete(entry.key);
    }
  }

  /**
   * Close any shell whose session has stopped being valid.
   *
   * This is what makes a sign-out reach a terminal that is already open: an
   * HTTP guard only runs on requests, and a shell makes none. The local
   * session's cookie does not rotate, so the upgrade's cookie is the one to
   * check. The sweep only reads; nothing here extends a session's life.
   */
  private async sweepRevoked(): Promise<void> {
    for (const entry of [...this.live]) {
      const still = await authorizeUpgrade(
        { headers: { cookie: entry.cookie } },
        this.identity,
        this.config.get("FRONTEND_URL"),
      );
      if (!still) {
        // Detached shells too: a signed-out session's shell is not waiting for anyone.
        entry.session.dispose(4401, "session-revoked");
        this.forget(entry.session);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.revokeTimer) clearInterval(this.revokeTimer);
    if (this.upgradeHandler && this.httpServer) {
      this.httpServer.off("upgrade", this.upgradeHandler);
    }
    for (const entry of [...this.live]) entry.session.dispose(1001, "shutdown");
    this.live.clear();
    this.byKey.clear();
    this.wss?.close();
  }
}

/** One query parameter of the upgrade URL, if present. */
function queryParam(url: string | undefined, name: string): string | null {
  const q = url?.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return q ? new URLSearchParams(q).get(name) : null;
}

/**
 * The key a named shell is kept by: the sign-in, the desktop session (tab) and the window's token, so a
 * shell is found only by the tab and sign-in it was started in. `resuming` when the tab came back for it
 * (`resume=`), rather than starting it (`shell=`). Null when the tab named no shell.
 */
function shellKey(caller: Caller, url: string | undefined): { key: string; resuming: boolean } | null {
  const desktopSession = queryParam(url, "session") ?? "";
  const resume = queryParam(url, "resume");
  if (isShellToken(resume)) return { key: `${caller.sid}:${desktopSession}:${resume}`, resuming: true };
  const fresh = queryParam(url, "shell");
  if (isShellToken(fresh)) return { key: `${caller.sid}:${desktopSession}:${fresh}`, resuming: false };
  return null;
}

/** Read optional `cols`/`rows` from the upgrade URL query string. */
function parseGeometry(url: string | undefined): {
  cols: number;
  rows: number;
} {
  let cols = DEFAULT_COLS;
  let rows = DEFAULT_ROWS;
  const q = url?.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  if (q) {
    const params = new URLSearchParams(q);
    const c = Number(params.get("cols"));
    const r = Number(params.get("rows"));
    // Clamp to sane bounds: reject non-positive and cap the upper end so a
    // client can't request an absurd geometry.
    if (Number.isFinite(c) && c > 0) cols = Math.min(Math.floor(c), MAX_COLS);
    if (Number.isFinite(r) && r > 0) rows = Math.min(Math.floor(r), MAX_ROWS);
  }
  return { cols, rows };
}
