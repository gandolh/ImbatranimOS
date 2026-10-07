import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import type { Env } from '../../config/env.schema';
import { UpgradeRoutes } from '../../upgrade-routes';
import { LocalIdentityService } from '../auth/ws-auth';
import { authorizeUpgrade } from '../pty/pty-upgrade';
import { MarketplaceServers } from './marketplace-servers.service';
import { isUrlAppId } from './source-url';

/** `/api/marketplace/apps/<id>/server[/rest]`. */
const SERVER_PATH =
  /^\/api\/marketplace\/apps\/([a-z][a-z0-9-]{1,39})\/server(\/[^?#]*)?$/;
/** The most proxied sockets one app may hold. */
export const MAX_SOCKETS_PER_APP = 32;
/** A socket whose peer is not reading is closed past this much unsent data. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
/** Same cadence as the terminal's and the Browser relay's sweep. */
const REVOKE_SWEEP_MS = 30_000;

interface Live {
  client: WebSocket;
  upstream: WebSocket;
  cookie: string | undefined;
}

/**
 * A service app's WebSocket, reached through the desktop's own port (brief
 * 120). The app's server listens on 127.0.0.1 only; this is the one way in,
 * and it asks exactly what the terminal asks: a live session, from the
 * desktop's origin. Sessions are re-checked every
 * {@link REVOKE_SWEEP_MS}, as the terminal's are.
 *
 * The upstream connection carries no cookie and no Authorization: the
 * desktop's session is the backend's, never the app server's.
 */
@Injectable()
export class MarketplaceWsProxy
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MarketplaceWsProxy.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    // Answer with the subprotocol the app's server chose.
    handleProtocols: (_protocols, req) => this.chosenProtocol.get(req) ?? false,
  });
  private readonly chosenProtocol = new WeakMap<IncomingMessage, string>();
  private readonly live = new Set<Live>();
  private readonly perApp = new Map<string, number>();
  private unregister: (() => void) | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly upgrades: UpgradeRoutes,
    private readonly identity: LocalIdentityService,
    private readonly config: ConfigService<Env, true>,
    private readonly servers: MarketplaceServers,
  ) {}

  onApplicationBootstrap(): void {
    this.unregister = this.upgrades.register({
      matches: (path) => SERVER_PATH.test(path),
      handle: (req, socket, head) => this.onUpgrade(req, socket, head),
    });
    this.sweepTimer = setInterval(
      () => void this.sweepRevoked(),
      REVOKE_SWEEP_MS,
    );
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    this.unregister?.();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const entry of this.live) {
      entry.client.close(1001, 'shutdown');
      entry.upstream.terminate();
    }
    this.live.clear();
    this.wss.close();
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    // See PtyGateway: an unhandled socket error while the session is checked
    // would take the process down.
    const onSocketError = () => socket.destroy();
    socket.on('error', onSocketError);
    const refuse = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
      socket.destroy();
    };

    const [pathname, query] = splitUrl(req.url ?? '');
    const match = SERVER_PATH.exec(pathname);
    if (!match) return refuse('404 Not Found');
    const id = match[1];
    // An app installed from a URL (brief 158) has no server, and the catalog
    // refuses its `x-` ids.
    if (isUrlAppId(id)) return refuse('404 Not Found');
    const rest = match[2] ?? '/';

    void (async () => {
      const record = await authorizeUpgrade(
        req,
        this.identity,
        this.config.get('FRONTEND_URL'),
      );
      if (socket.destroyed) return;
      if (!record) {
        this.logger.warn(`Rejected an unauthorized upgrade to ${id}'s server`);
        return refuse('401 Unauthorized');
      }
      // Only a server the desktop started (through the session-checked
      // lease route) has a port; that is also what makes `id` a catalog app.
      const port = this.servers.portFor(id);
      if (port === null) return refuse('503 Service Unavailable');
      if ((this.perApp.get(id) ?? 0) >= MAX_SOCKETS_PER_APP) {
        return refuse('503 Service Unavailable');
      }

      const protocols = (req.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const upstream = new WebSocket(
        `ws://127.0.0.1:${port}${rest}${query}`,
        protocols,
        { handshakeTimeout: CONNECT_TIMEOUT_MS, perMessageDeflate: false },
      );
      // An 'error' with no listener throws; `pipe` adds the real one.
      upstream.on('error', () => undefined);
      const opened = await new Promise<boolean>((resolve) => {
        upstream.once('open', () => resolve(true));
        upstream.once('error', () => resolve(false));
        upstream.once('unexpected-response', () => resolve(false));
      });
      if (!opened || socket.destroyed) {
        upstream.terminate();
        if (!socket.destroyed) refuse('502 Bad Gateway');
        return;
      }
      if (upstream.protocol) this.chosenProtocol.set(req, upstream.protocol);

      socket.off('error', onSocketError);
      this.wss.handleUpgrade(req, socket, head, (client) => {
        this.pipe(id, client, upstream, req.headers.cookie);
      });
    })();
  }

  private pipe(
    id: string,
    client: WebSocket,
    upstream: WebSocket,
    cookie: string | undefined,
  ): void {
    const entry: Live = { client, upstream, cookie };
    this.live.add(entry);
    this.perApp.set(id, (this.perApp.get(id) ?? 0) + 1);
    this.servers.socketOpened(id);

    const forward = (to: WebSocket) => (data: RawData, isBinary: boolean) => {
      if (to.readyState !== WebSocket.OPEN) return;
      if (to.bufferedAmount > MAX_BUFFERED_BYTES) {
        // The far side stopped reading. Better a closed socket than the
        // backend's memory.
        client.close(1009, 'backpressure');
        upstream.terminate();
        return;
      }
      to.send(data, { binary: isBinary });
    };
    client.on('message', forward(upstream));
    upstream.on('message', forward(client));

    let closed = false;
    const close = (code: number, reason: Buffer) => {
      if (closed) return;
      closed = true;
      this.live.delete(entry);
      this.perApp.set(id, Math.max(0, (this.perApp.get(id) ?? 1) - 1));
      this.servers.socketClosed(id);
      const sendable =
        code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code);
      for (const ws of [client, upstream]) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(sendable ? code : 1011, reason.subarray(0, 120));
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
        }
      }
    };
    client.on('close', close);
    upstream.on('close', close);
    client.on('error', () => upstream.terminate());
    upstream.on('error', () => client.close(1011, 'app server error'));
  }

  /** Close every socket whose session ended. See PtyGateway. */
  private async sweepRevoked(): Promise<void> {
    for (const entry of [...this.live]) {
      const still = await authorizeUpgrade(
        { headers: { cookie: entry.cookie } },
        this.identity,
        this.config.get('FRONTEND_URL'),
      );
      if (!still) {
        entry.client.close(4401, 'session-revoked');
        entry.upstream.terminate();
      }
    }
  }
}

function splitUrl(url: string): [string, string] {
  const q = url.indexOf('?');
  return q === -1 ? [url, ''] : [url.slice(0, q), url.slice(q)];
}
