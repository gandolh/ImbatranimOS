import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import type { Env } from '../../config/env.schema';
import { LocalIdentityService } from '../auth/ws-auth';
import { authorizeUpgrade } from '../pty/pty-upgrade';
import { UpgradeRoutes } from '../../upgrade-routes';
import { WaylandHostService } from './wayland-host.service';
import { clampSize, toHostMessage } from './wayland-input';
import {
  CLOSE_REVOKED,
  CLOSE_SESSION_IN_USE,
  CLOSE_UNAVAILABLE,
  FRAME_ACK_LOW_WATER,
  FRAME_ACK_POLL_MS,
  MAX_CLIENT_MESSAGE,
  MAX_WAYLAND_SESSIONS,
  WAYLAND_PATH,
  WAYLAND_REVOKE_SWEEP_MS,
} from './wayland.constants';
import {
  frameToplevel,
  isValidSessionId,
  WS_KIND_FRAME,
  type HostOutbound,
} from './wayland.protocol';

interface LiveSession {
  id: string;
  ws: WebSocket;
  /** The upgrade's cookie header, rechecked by the revocation sweep. */
  cookie: string | undefined;
  /** Toplevels whose frame went out and whose ack waits for the socket to drain. */
  awaitingAck: Set<number>;
  ackTimer: NodeJS.Timeout | null;
}

/**
 * `/api/wayland`: one desktop session's Linux windows, relayed between its
 * tab and the Wayland host.
 *
 * The tab opens it once signed in, naming its desktop session id; the backend
 * asks the host for that session's display (`wayland-<id>`), forwards the
 * session's toplevel events as JSON and its frames as binary messages, and
 * tells the host when the socket has room for a window's next frame. The
 * same checks as the Terminal: the session cookie and Origin on upgrade, and
 * the sweep that closes a socket whose sign-in ended. Closing the socket ends
 * the session and disconnects its apps.
 */
@Injectable()
export class WaylandGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WaylandGateway.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE,
  });
  private readonly live = new Map<string, LiveSession>();
  private unregister: (() => void) | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly upgrades: UpgradeRoutes,
    private readonly identity: LocalIdentityService,
    private readonly config: ConfigService<Env, true>,
    private readonly host: WaylandHostService,
  ) {}

  onApplicationBootstrap(): void {
    this.unregister = this.upgrades.register({
      matches: (path) => path === WAYLAND_PATH,
      handle: (req, socket, head) => this.onUpgrade(req, socket, head),
    });
    this.sweepTimer = setInterval(
      () => void this.sweepRevoked(),
      WAYLAND_REVOKE_SWEEP_MS,
    );
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    this.unregister?.();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const s of [...this.live.values()]) this.end(s, 1001, 'shutdown');
    this.wss.close();
  }

  /**
   * True while a tab holds this desktop session's socket: it is signed in,
   * open, and its Linux apps have a display.
   */
  hasSession(id: string): boolean {
    return this.live.has(id);
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
    const params = parseQuery(req.url);
    const session = params.get('session');
    if (!isValidSessionId(session)) return refuse('400 Bad Request');
    const width = clampSize(params.get('width'));
    const height = clampSize(params.get('height'));

    void (async () => {
      const caller = await authorizeUpgrade(
        req,
        this.identity,
        this.config.get('FRONTEND_URL'),
      );
      if (socket.destroyed) return;
      if (!caller) {
        this.logger.warn('Rejected an unauthorized Linux windows upgrade');
        return refuse('401 Unauthorized');
      }
      socket.off('error', onSocketError);
      this.wss.handleUpgrade(req, socket, head, (ws) =>
        this.onConnection(ws, session, width, height, req.headers.cookie),
      );
    })();
  }

  private onConnection(
    ws: WebSocket,
    id: string,
    width: number,
    height: number,
    cookie: string | undefined,
  ): void {
    // One socket per desktop session. A second one for the same id is a
    // duplicated tab (it copies sessionStorage); it picks a new id and
    // comes back.
    if (this.live.has(id)) {
      ws.close(CLOSE_SESSION_IN_USE, 'session-in-use');
      return;
    }
    if (this.live.size >= MAX_WAYLAND_SESSIONS) {
      ws.close(CLOSE_UNAVAILABLE, 'too-many-sessions');
      return;
    }
    const s: LiveSession = {
      id,
      ws,
      cookie,
      awaitingAck: new Set(),
      ackTimer: null,
    };
    this.live.set(id, s);
    ws.on('close', () => this.end(s));
    ws.on('error', () => this.end(s));
    ws.on('message', (data: RawData, isBinary: boolean) =>
      this.onClientMessage(s, data, isBinary),
    );

    const failure = this.host.open(id, width, height, {
      message: (m) => this.onHostMessage(s, m),
      frame: (body) => this.onFrame(s, body),
      gone: (reason) => {
        this.safeSend(s, JSON.stringify({ type: 'unavailable', reason }));
        this.end(s, CLOSE_UNAVAILABLE, 'host-gone');
      },
    });
    if (failure) {
      this.logger.warn(`Linux apps unavailable: ${failure}`);
      this.safeSend(
        s,
        JSON.stringify({ type: 'unavailable', reason: failure }),
      );
      this.end(s, CLOSE_UNAVAILABLE, 'unavailable');
    }
  }

  private onHostMessage(s: LiveSession, m: HostOutbound): void {
    if (m.type === 'session_failed') {
      this.safeSend(
        s,
        JSON.stringify({ type: 'unavailable', reason: m.reason }),
      );
      this.end(s, CLOSE_UNAVAILABLE, 'session-failed');
      return;
    }
    if (m.type === 'session_ready' || m.type === 'hello') return;
    // Toplevel events go to the tab as they are, minus the routing field.
    this.safeSend(s, JSON.stringify({ ...m, session: undefined }));
  }

  private onFrame(s: LiveSession, body: Buffer): void {
    if (s.ws.readyState !== s.ws.OPEN) return;
    const toplevel = frameToplevel(body);
    s.ws.send(Buffer.concat([Buffer.from([WS_KIND_FRAME]), body]), {
      binary: true,
    });
    s.awaitingAck.add(toplevel);
    this.ackWhenDrained(s);
  }

  /**
   * Tell the host each waiting window may send again once the socket has
   * room. While it doesn't, the host holds the window's frame callbacks and
   * folds new damage into one later frame: intermediate frames are dropped
   * at the source, never queued here.
   */
  private ackWhenDrained(s: LiveSession): void {
    if (s.ackTimer) return;
    const tryAck = () => {
      if (!this.live.has(s.id)) return;
      if (s.ws.bufferedAmount > FRAME_ACK_LOW_WATER) {
        s.ackTimer = setTimeout(tryAck, FRAME_ACK_POLL_MS);
        return;
      }
      s.ackTimer = null;
      for (const toplevel of s.awaitingAck) {
        this.host.send({ type: 'frame_ack', session: s.id, toplevel });
      }
      s.awaitingAck.clear();
    };
    tryAck();
  }

  private onClientMessage(
    s: LiveSession,
    data: RawData,
    isBinary: boolean,
  ): void {
    if (isBinary) return;
    let msg: unknown;
    try {
      msg = JSON.parse(rawText(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const forHost = toHostMessage(s.id, msg as Record<string, unknown>);
    if (forHost) this.host.send(forHost);
  }

  private safeSend(s: LiveSession, text: string): void {
    if (s.ws.readyState === s.ws.OPEN) s.ws.send(text);
  }

  /** End a session: its socket, its display in the host, its apps. Idempotent. */
  private end(s: LiveSession, code?: number, reason?: string): void {
    if (this.live.get(s.id) !== s) return;
    this.live.delete(s.id);
    if (s.ackTimer) clearTimeout(s.ackTimer);
    this.host.close(s.id);
    if (code !== undefined && s.ws.readyState === s.ws.OPEN)
      s.ws.close(code, reason);
  }

  private async sweepRevoked(): Promise<void> {
    for (const s of [...this.live.values()]) {
      const still = await authorizeUpgrade(
        { headers: { cookie: s.cookie } },
        this.identity,
        this.config.get('FRONTEND_URL'),
      );
      if (!still) this.end(s, CLOSE_REVOKED, 'session-revoked');
    }
  }
}

function parseQuery(url: string | undefined): URLSearchParams {
  const q = url?.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  return new URLSearchParams(q);
}

function rawText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}
