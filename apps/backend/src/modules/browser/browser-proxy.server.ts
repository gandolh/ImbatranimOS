import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { logging, server as wisp } from '@mercuryworkshop/wisp-js/server';

import { browserProxyOriginOf, type Env } from '../../config/env.schema';
import { WardService } from '../auth/ws-auth';
import { authorizeUpgrade } from '../pty/pty-upgrade';
import { WardFreshness } from '../ward/ward-freshness';
import { GuardedTcpSocket, RefusedUdpSocket } from './guarded-socket';
import { proxyAssets, type ProxyAsset } from './proxy-assets';

/** The Wisp relay's path on the proxy origin. */
export const WISP_PATH = '/wisp/';

/** Open relays at once. One Browser window holds one; a few tabs of the desktop hold a few. */
export const MAX_RELAYS = 8;

/** Streams (TCP connections) one relay may hold open. */
const MAX_STREAMS_PER_RELAY = 96;

/** Same cadence as the terminal's: a revoked session loses the relay within it. */
const REVOKE_SWEEP_MS = 30_000;

interface LiveRelay {
  ws: WebSocket;
  sid: string;
  cookie: string | undefined;
}

/**
 * The Browser's proxy origin (brief 50): a second HTTP listener in the same
 * process, on BROWSER_PROXY_PORT.
 *
 * Proxied pages are served to the viewing browser from here, never from the
 * desktop's origin. Scramjet rewrites a page so it believes it is on its real
 * site, but the browser runs it on whatever origin served it; on the desktop's,
 * a single rewriter escape would hold the session and could open the terminal.
 * On this origin it can reach neither: the desktop's API refuses its mutating
 * requests (the guard's Origin check), CORS hides the rest, and the terminal's
 * upgrade checks Origin too.
 *
 * It serves a fixed list of static files ({@link proxyAssets}) and one
 * WebSocket, the Wisp relay at {@link WISP_PATH}. The relay is authenticated
 * exactly like the terminal (session and grant, through `WardService`), must
 * come from this origin, and connects only where {@link GuardedTcpSocket}
 * allows: public addresses on web ports.
 */
@Injectable()
export class BrowserProxyServer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BrowserProxyServer.name);
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly live = new Set<LiveRelay>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private assets: ReadonlyMap<string, ProxyAsset> = new Map();
  /** The proxy origin, or null when the Browser is off. */
  readonly origin: string | null;
  private readonly frontendOrigin: string;

  constructor(
    private readonly ward: WardService,
    private readonly config: ConfigService<Env, true>,
    private readonly freshness: WardFreshness,
  ) {
    const frontend = this.config.get('FRONTEND_URL', { infer: true });
    this.frontendOrigin = new URL(frontend).origin;
    this.origin = browserProxyOriginOf({
      FRONTEND_URL: frontend,
      BROWSER_PROXY_PORT: this.config.get('BROWSER_PROXY_PORT', {
        infer: true,
      }),
      BROWSER_PROXY_ORIGIN: this.config.get('BROWSER_PROXY_ORIGIN', {
        infer: true,
      }),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const port = this.config.get('BROWSER_PROXY_PORT', { infer: true });
    if (port === undefined || !this.origin) return;

    // wisp-js keeps its settings in one module-level object. Its own filter
    // is left at its defaults and not relied on (see GuardedTcpSocket).
    wisp.options.allow_udp_streams = false;
    wisp.options.stream_limit_total = MAX_STREAMS_PER_RELAY;
    wisp.options.parse_real_ip = false;
    // At INFO it logs every destination a page connects to: the browsing
    // history, in the container log. Refusals are logged by the socket.
    logging.set_level(logging.ERROR);

    this.assets = proxyAssets();
    this.wss = new WebSocketServer({ noServer: true });
    const server = createServer((req, res) => void this.serveAsset(req, res));
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head) =>
      this.onUpgrade(req, socket, head),
    );
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.sweepTimer = setInterval(
      () => void this.sweepRevoked(),
      REVOKE_SWEEP_MS,
    );
    this.logger.log(`Browser proxy origin ${this.origin} (port ${port})`);
  }

  // ── static files ─────────────────────────────────────────────────────────

  private async serveAsset(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const path = (req.url ?? '/').split('?', 1)[0];
    const asset = this.assets.get(path);
    if (!asset) {
      res.writeHead(404).end();
      return;
    }
    let stat: { size: number; mtimeMs: number };
    try {
      stat = await fs.stat(asset.file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (path === '/host.html') {
      res.setHeader('Content-Security-Policy', this.hostPolicy());
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': asset.type,
      'Content-Length': stat.size,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(asset.file)
      .on('error', () => res.destroy())
      .pipe(res);
  }

  /**
   * The host page's policy. What it is for is `frame-ancestors`: only the
   * desktop may frame it, so no other site can wrap a signed-in proxy in its
   * own UI. Proxied pages are served by the service worker and carry their own
   * headers, not this.
   *
   * `'unsafe-eval'` because Scramjet's controller compiles code from strings.
   * It costs little here: every proxied site's own scripts run on this origin
   * by design, which is why it is not the desktop's.
   */
  private hostPolicy(): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${this.frontendOrigin}`,
    ].join('; ');
  }

  // ── the relay ────────────────────────────────────────────────────────────

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    // See the terminal's gateway: an unhandled socket error while the session
    // is checked would take the process down.
    const onSocketError = () => socket.destroy();
    socket.on('error', onSocketError);

    const path = (req.url ?? '').split('?', 1)[0];
    if (path !== WISP_PATH || !this.origin) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const origin = this.origin;
    void (async () => {
      // The same check as the terminal: a live session holding this app's
      // grant, and an Origin of this proxy origin (or none). The desktop's
      // own origin is not accepted: the relay is for the proxy's pages.
      const record =
        req.headers.origin === undefined || req.headers.origin === origin
          ? await authorizeUpgrade(req, this.ward, origin)
          : null;
      if (socket.destroyed) return;
      if (!record) {
        this.logger.warn('Rejected an unauthorized Browser relay upgrade');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      if (this.live.size >= MAX_RELAYS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      socket.off('error', onSocketError);
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        const entry: LiveRelay = {
          ws,
          sid: record.sid,
          cookie: req.headers.cookie,
        };
        this.live.add(entry);
        ws.on('close', () => this.live.delete(entry));
        void this.runRelay(ws, req);
      });
    })();
  }

  private async runRelay(ws: WebSocket, req: IncomingMessage): Promise<void> {
    ws.binaryType = 'arraybuffer';
    const conn = new wisp.ServerConnection(ws, WISP_PATH, {
      TCPSocket: GuardedTcpSocket,
      UDPSocket: RefusedUdpSocket,
      // wisp-js's own rule: v2 when the client offers a subprotocol.
      wisp_version: req.headers['sec-websocket-protocol'] ? 2 : 1,
    });
    try {
      await conn.setup();
      await conn.run();
    } catch {
      ws.close();
    }
  }

  /** Close every relay whose session ended or lost its grant. See PtyGateway. */
  private async sweepRevoked(): Promise<void> {
    if (!this.origin) return;
    for (const entry of [...this.live]) {
      const cookie = this.freshness.latest(entry.sid) ?? entry.cookie;
      const still = await authorizeUpgrade(
        { headers: { cookie } },
        this.ward,
        this.origin,
      );
      if (!still) {
        entry.ws.close(4401, 'session-revoked');
        this.live.delete(entry);
      } else {
        entry.cookie = cookie;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const entry of this.live) entry.ws.close(1001, 'shutdown');
    this.live.clear();
    this.wss?.close();
    const server = this.server;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  /** The port actually bound. For tests that listen on port 0. */
  boundPort(): number | null {
    const address = this.server?.address();
    return address && typeof address === 'object' ? address.port : null;
  }
}
