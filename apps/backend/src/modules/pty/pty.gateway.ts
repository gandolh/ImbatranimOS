import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import * as pty from 'node-pty';
import type { Env } from '../../config/env.schema';
import { WardService } from '../auth/ws-auth';
import { PtySession } from './pty-session';
import { isPtyUpgrade, authorizeUpgrade } from './pty-upgrade';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  MAX_SESSIONS,
  PTY_PATH,
  resolveHome,
  resolveShell,
} from './pty.constants';

/**
 * How often to re-check that each live terminal's session is still valid.
 *
 * Thirty seconds, and it now lines up exactly with Ward's introspection cache
 * window — so a sweep costs at most one request per session per window rather
 * than one per check, and a revoked session closes the shell within the same
 * 30 seconds it stops working everywhere else in the estate.
 */
const REVOKE_SWEEP_MS = 30_000;

interface LiveSession {
  session: PtySession;
  /**
   * The raw `Cookie` header the upgrade arrived with, re-checked by the
   * revocation sweep.
   *
   * The whole header rather than a parsed token: which cookie Ward uses is
   * `ward.client.ts`'s business, and a second copy of that knowledge here is
   * how the terminal ends up honouring a session the REST guard refuses.
   */
  cookie: string | undefined;
}

/**
 * Terminal WebSocket gateway. Attaches a raw `ws` server to Nest's underlying
 * HTTP server via the `upgrade` event (`noServer: true`) — no change to
 * main.ts required. Every upgrade is authenticated through the shared
 * `WardService` — the same client the REST guard uses — and must also carry an
 * `imbatranimos` grant before a pty is spawned as the current process user.
 */
@Injectable()
export class PtyGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PtyGateway.name);
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private readonly live = new Set<LiveSession>();
  private revokeTimer: NodeJS.Timeout | null = null;
  private upgradeHandler:
    | ((req: IncomingMessage, socket: Duplex, head: Buffer) => void)
    | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly ward: WardService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // getHttpServer() is typed `any` on the base HttpAdapterHost<AbstractHttpAdapter>
    // generic (TServer defaults to `any`); the concrete adapter Nest wires up
    // here is always the Node http/https server this gateway attaches to.
    const server = this.adapterHost.httpAdapter?.getHttpServer?.() as
      | HttpServer
      | undefined;
    if (!server) {
      this.logger.error('No HTTP server available; terminal WS not attached');
      return;
    }
    this.httpServer = server;
    this.wss = new WebSocketServer({ noServer: true });

    this.upgradeHandler = (req, socket, head) => {
      // Once any 'upgrade' listener exists, Node stops answering upgrades
      // itself, so an unclaimed one would pin its socket until the peer gave
      // up. Refuse it. A future WebSocket endpoint must be dispatched from this
      // handler, not from a second 'upgrade' listener, or the two would each
      // refuse the other's path.
      if (!isPtyUpgrade(req.url)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Node removes its own socket 'error' listener before emitting
      // 'upgrade'. Without this one, a client that resets the connection while
      // Ward is being asked emits ECONNRESET with no listener, which throws and
      // takes the whole backend down (brief 138). `handleUpgrade` installs its
      // own, so this is removed just before it; the refusals keep it until
      // `destroy()`.
      const onSocketError = (err: Error) => {
        this.logger.debug(`Terminal upgrade socket error: ${err.message}`);
        socket.destroy();
      };
      socket.on('error', onSocketError);

      /*
       * Authorization is asynchronous now — liveness is a call to Ward — so
       * this handler starts a promise rather than deciding inline. The socket
       * is held open meanwhile, which is what an upgrade already does; nothing
       * is spawned until the answer arrives.
       */
      void (async () => {
        const record = await authorizeUpgrade(
          req,
          this.ward,
          this.config.get('FRONTEND_URL'),
        );
        // The client left while Ward was answering: nothing to refuse and
        // nobody to spawn a shell for.
        if (socket.destroyed) return;
        if (!record) {
          this.logger.warn('Rejected unauthorized terminal upgrade');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Cap concurrent shells so a client can't exhaust PIDs/memory by
        // opening sockets in a loop. Reject the handshake before spawning
        // anything.
        if (this.live.size >= MAX_SESSIONS) {
          this.logger.warn(`Terminal session cap reached (${MAX_SESSIONS})`);
          socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
          socket.destroy();
          return;
        }

        socket.off('error', onSocketError);
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.onConnection(ws, req);
        });
      })();
    };
    server.on('upgrade', this.upgradeHandler);

    this.revokeTimer = setInterval(
      () => void this.sweepRevoked(),
      REVOKE_SWEEP_MS,
    );
    this.logger.log(`Terminal WS listening on ${PTY_PATH}`);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const { cols, rows } = parseGeometry(req.url);
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(resolveShell(), [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolveHome(),
        env: shellEnv(process.env),
      });
    } catch (err) {
      this.logger.error(`Failed to spawn shell: ${(err as Error).message}`);
      try {
        ws.send('\r\n[failed to start shell]\r\n');
      } catch {
        /* noop */
      }
      ws.close(1011, 'spawn-failed');
      return;
    }

    const entry: LiveSession = {
      session: new PtySession(ptyProcess, ws),
      // The whole cookie header, not a parsed token: `authenticate` owns the
      // knowledge of which cookie Ward uses, and this file must not acquire a
      // second copy of it.
      cookie: req.headers.cookie,
    };
    this.live.add(entry);
    ws.on('close', () => this.live.delete(entry));
    this.logger.log(`Terminal opened (${this.live.size} live)`);
  }

  /**
   * Kill any pty whose session cookie is no longer valid (logged out or
   * expired). Complements the socket-close path so a revoked session can't
   * keep a shell alive.
   */
  /**
   * Close any shell whose session has stopped being valid.
   *
   * This is what makes revocation reach a terminal that is already open — an
   * HTTP guard only runs on requests, and a shell makes none. It is also why
   * the old code was careful that validation here never *renewed* expiry: an
   * open shell must not be able to immortalize its own session by existing.
   * That hazard is gone rather than guarded against, because Ward's tokens do
   * not slide on introspection at all; nothing this sweep does can extend a
   * session's life.
   *
   * A grant revoked in Ward's console closes the shell too, not just a signed-out
   * session: `authorizeUpgrade` checks the grant, and so does this.
   */
  private async sweepRevoked(): Promise<void> {
    for (const entry of [...this.live]) {
      const still = await authorizeUpgrade(
        { headers: { cookie: entry.cookie } },
        this.ward,
        this.config.get('FRONTEND_URL'),
      );
      if (!still) {
        entry.session.dispose(4401, 'session-revoked');
        this.live.delete(entry);
      }
    }
  }

  onModuleDestroy(): void {
    if (this.revokeTimer) clearInterval(this.revokeTimer);
    if (this.upgradeHandler && this.httpServer) {
      this.httpServer.off('upgrade', this.upgradeHandler);
    }
    for (const entry of this.live) entry.session.dispose(1001, 'shutdown');
    this.live.clear();
    this.wss?.close();
  }
}

/**
 * The environment a terminal starts with: the backend's own, minus Ward's.
 *
 * `WARD_APP_KEY` is a secret the config schema says never leaves the server,
 * and a shell inheriting `process.env` handed it to anyone with a terminal
 * (`echo $WARD_APP_KEY`). Every `WARD_*` name goes, not just the key: none of
 * them is the shell's business.
 *
 * A denylist rather than an allowlist on purpose. The terminal is the user's
 * workspace on a real system, and an allowlist would also strip whatever the
 * image or the operator set for them (`EDITOR`, locale, tool paths). The cost
 * is that a future secret must be added here; the schema marks each one.
 *
 * A copy: `process.env` itself is never touched.
 */
export function shellEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('WARD_')) out[name] = value;
  }
  return out;
}

/** Read optional `cols`/`rows` from the upgrade URL query string. */
function parseGeometry(url: string | undefined): {
  cols: number;
  rows: number;
} {
  let cols = DEFAULT_COLS;
  let rows = DEFAULT_ROWS;
  const q = url?.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (q) {
    const params = new URLSearchParams(q);
    const c = Number(params.get('cols'));
    const r = Number(params.get('rows'));
    // Clamp to sane bounds: reject non-positive and cap the upper end so a
    // client can't request an absurd geometry.
    if (Number.isFinite(c) && c > 0) cols = Math.min(Math.floor(c), MAX_COLS);
    if (Number.isFinite(r) && r > 0) rows = Math.min(Math.floor(r), MAX_ROWS);
  }
  return { cols, rows };
}
