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
import { clampRatio, clampSize, toHostMessage } from './wayland-input';
import {
  clientGroups,
  liveGroups,
  SessionApps,
  signalGroups,
} from './session-apps';
import {
  CLOSE_REVOKED,
  CLOSE_SESSION_ENDING,
  CLOSE_SESSION_IN_USE,
  CLOSE_UNAVAILABLE,
  FRAME_ACK_LOW_WATER,
  FRAME_ACK_POLL_MS,
  MAX_CLIENT_MESSAGE,
  MAX_WAYLAND_SESSIONS,
  WAYLAND_GRACE_MS,
  WAYLAND_KILL_AFTER_MS,
  WAYLAND_PATH,
  WAYLAND_TAKEOVER_WAIT_MS,
  WAYLAND_REVOKE_SWEEP_MS,
} from './wayland.constants';
import {
  frameToplevel,
  isValidSessionId,
  WS_KIND_FRAME,
  type HostOutbound,
} from './wayland.protocol';

/** The tab's viewport in CSS pixels and its devicePixelRatio, from the upgrade's query. */
interface TabOutput {
  width: number;
  height: number;
  ratio: number;
}

interface LiveSession {
  id: string;
  /** The tab's socket; null while the session waits out its grace period. */
  ws: WebSocket | null;
  /** The upgrade's cookie header, rechecked by the revocation sweep. */
  cookie: string | undefined;
  /** Toplevels whose frame went out and whose ack waits for the socket to drain. */
  awaitingAck: Set<number>;
  ackTimer: NodeJS.Timeout | null;
  /** Runs out {@link WAYLAND_GRACE_MS} after the socket closed, and ends the session. */
  grace: NodeJS.Timeout | null;
  /** The cover screen is up: the session's apps are frozen. */
  covered: boolean;
  /** The processes connected to the session's socket, as the host last said. */
  clientPids: number[];
}

/**
 * Another module's part in each session's life: the Linux apps' session bus
 * starts with a session and hears its tab's messages about it.
 */
export type SessionHooks = {
  /** A new session is live (not a resumed one). */
  started?(session: string): void;
  /** A message from the tab the host doesn't take; true when handled. */
  tabMessage?(session: string, message: Record<string, unknown>): boolean;
};

/**
 * `/api/wayland`: one desktop session's Linux windows, relayed between its
 * tab and the Wayland host.
 *
 * The tab opens it once signed in, naming its desktop session id; the backend
 * asks the host for that session's display (`wayland-<id>`), forwards the
 * session's toplevel events as JSON and its frames as binary messages, and
 * tells the host when the socket has room for a window's next frame. The
 * same checks as the Terminal: the session cookie and Origin on upgrade, and
 * the sweep that closes a socket whose sign-in ended.
 *
 * A session outlives its socket by {@link WAYLAND_GRACE_MS}: a reload (the
 * same session id from sessionStorage) takes it back, and the host announces
 * its windows again. After that, or at once when the sign-in ended, the
 * session ends: its apps' process groups get SIGTERM, then SIGKILL, and the
 * host removes its socket. Under the cover screen the groups are frozen
 * (SIGSTOP) until it lifts.
 */
@Injectable()
export class WaylandGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WaylandGateway.name);
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE,
  });
  private readonly live = new Map<string, LiveSession>();
  /** Sessions whose apps are being stopped; their id can't be taken meanwhile. */
  private readonly ending = new Set<string>();
  /** How long a session outlives its socket, and how long SIGTERM gets; a test shortens them. */
  graceMs = WAYLAND_GRACE_MS;
  killAfterMs = WAYLAND_KILL_AFTER_MS;
  private unregister: (() => void) | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private readonly hooks: SessionHooks[] = [];

  constructor(
    private readonly upgrades: UpgradeRoutes,
    private readonly identity: LocalIdentityService,
    private readonly config: ConfigService<Env, true>,
    private readonly host: WaylandHostService,
    private readonly apps: SessionApps,
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

  addSessionHooks(hooks: SessionHooks): void {
    this.hooks.push(hooks);
  }

  /** Send a JSON message to a live session's tab, when it has one open. */
  sendToTab(session: string, message: object): void {
    const s = this.live.get(session);
    if (s) this.safeSend(s, JSON.stringify(message));
  }

  onModuleDestroy(): void {
    this.unregister?.();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    for (const s of [...this.live.values()]) this.end(s, 1001, 'shutdown');
    // The backend is going: no waiting for SIGKILL's turn.
    for (const id of [...this.ending]) this.ending.delete(id);
    this.wss.close();
  }

  /**
   * The X display (`DISPLAY=:<n>`) of a desktop session's X11 apps, or null
   * when the session has none (yet).
   */
  x11Display(session: string): number | null {
    return this.host.x11Display(session);
  }

  /**
   * True while a tab holds this desktop session's socket: it is signed in,
   * open, and its Linux apps have a display.
   */
  hasSession(id: string): boolean {
    return !!this.live.get(id)?.ws;
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
    const output: TabOutput = {
      width: clampSize(params.get('width')),
      height: clampSize(params.get('height')),
      ratio: clampRatio(params.get('ratio')),
    };

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
        this.onConnection(ws, session, output, req.headers.cookie),
      );
    })();
  }

  private onConnection(
    ws: WebSocket,
    id: string,
    output: TabOutput,
    cookie: string | undefined,
  ): void {
    const existing = this.live.get(id);
    // One socket per desktop session. A second one for the same id is
    // either a reload whose old socket hasn't closed yet, or a duplicated
    // tab (it copies sessionStorage), which picks a new id and comes back.
    if (existing?.ws) {
      const started = Date.now();
      const wait = setInterval(() => {
        if (ws.readyState !== ws.OPEN) {
          clearInterval(wait);
          return;
        }
        if (this.live.get(id) === existing && !existing.ws) {
          clearInterval(wait);
          this.onConnection(ws, id, output, cookie);
        } else if (Date.now() - started > WAYLAND_TAKEOVER_WAIT_MS) {
          clearInterval(wait);
          ws.close(CLOSE_SESSION_IN_USE, 'session-in-use');
        }
      }, 50);
      return;
    }
    if (existing) {
      // A reload inside the grace period: the session and its apps are
      // still there. The host announces its windows again, whole.
      if (existing.grace) clearTimeout(existing.grace);
      existing.grace = null;
      existing.cookie = cookie;
      this.attach(existing, ws);
      // Told first, so the tab knows the windows that follow are the ones it
      // had (it puts them back where they were) and not new ones.
      this.safeSend(
        existing,
        JSON.stringify({ type: 'session', resumed: true }),
      );
      this.host.send({ type: 'output', session: id, ...output });
      this.host.send({ type: 'resync', session: id });
      return;
    }
    if (this.ending.has(id)) {
      ws.close(CLOSE_SESSION_ENDING, 'session-ending');
      return;
    }
    if (this.live.size >= MAX_WAYLAND_SESSIONS) {
      ws.close(CLOSE_UNAVAILABLE, 'too-many-sessions');
      return;
    }
    const s: LiveSession = {
      id,
      ws: null,
      cookie,
      awaitingAck: new Set(),
      ackTimer: null,
      grace: null,
      covered: false,
      clientPids: [],
    };
    this.live.set(id, s);
    this.attach(s, ws);

    const { width, height, ratio } = output;
    const failure = this.host.open(id, width, height, ratio, {
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
      return;
    }
    // A new session: none of its windows is one the tab had before.
    this.safeSend(s, JSON.stringify({ type: 'session', resumed: false }));
    for (const h of this.hooks) h.started?.(id);
  }

  private attach(s: LiveSession, ws: WebSocket): void {
    s.ws = ws;
    ws.on('close', () => this.detach(s, ws));
    ws.on('error', () => this.detach(s, ws));
    ws.on('message', (data: RawData, isBinary: boolean) =>
      this.onClientMessage(s, data, isBinary),
    );
  }

  /** The tab's socket closed: the session waits for a reload, then ends. */
  private detach(s: LiveSession, ws: WebSocket): void {
    if (this.live.get(s.id) !== s || s.ws !== ws) return;
    s.ws = null;
    if (s.ackTimer) clearTimeout(s.ackTimer);
    s.ackTimer = null;
    s.awaitingAck.clear();
    s.grace = setTimeout(() => this.end(s), this.graceMs);
    s.grace.unref();
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
    if (m.type === 'clients') {
      s.clientPids = m.pids.filter((p) => Number.isInteger(p) && p > 1);
      return;
    }
    // Toplevel events go to the tab as they are, minus the routing field.
    this.safeSend(s, JSON.stringify({ ...m, session: undefined }));
  }

  private onFrame(s: LiveSession, body: Buffer): void {
    // No tab: no ack either, so the host holds the window until a resync.
    if (!s.ws || s.ws.readyState !== s.ws.OPEN) return;
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
      if (!this.live.has(s.id) || !s.ws) return;
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
    const m = msg as Record<string, unknown>;
    if (m.type === 'cover') {
      if (typeof m.covered === 'boolean') this.cover(s, m.covered);
      return;
    }
    for (const h of this.hooks) if (h.tabMessage?.(s.id, m)) return;
    const forHost = toHostMessage(s.id, m);
    if (forHost) this.host.send(forHost);
  }

  private safeSend(s: LiveSession, text: string): void {
    if (s.ws?.readyState === s.ws?.OPEN) s.ws?.send(text);
  }

  /** The session's apps: started from Start, and connected from a Terminal. */
  private groupsOf(s: LiveSession): number[] {
    return [
      ...new Set([...this.apps.groups(s.id), ...clientGroups(s.clientPids)]),
    ];
  }

  /**
   * The cover screen came up (or lifted): freeze the session's apps, or
   * wake them, and tell the host so it neither waits on them nor sends
   * their windows meanwhile, and redraws them after.
   */
  private cover(s: LiveSession, covered: boolean): void {
    if (s.covered === covered) return;
    s.covered = covered;
    signalGroups(this.groupsOf(s), covered ? 'SIGSTOP' : 'SIGCONT');
    this.host.send({ type: 'freeze', session: s.id, frozen: covered });
  }

  /**
   * End a session: its socket, its apps, its display in the host.
   * Idempotent. The apps' groups get SIGTERM (woken first, if frozen), then
   * SIGKILL {@link WAYLAND_KILL_AFTER_MS} later; then the host removes the
   * session's socket, which disconnects whatever is left.
   */
  private end(s: LiveSession, code?: number, reason?: string): void {
    if (this.live.get(s.id) !== s) return;
    this.live.delete(s.id);
    if (s.ackTimer) clearTimeout(s.ackTimer);
    if (s.grace) clearTimeout(s.grace);
    const ws = s.ws;
    s.ws = null;
    if (code !== undefined && ws?.readyState === ws?.OPEN)
      ws?.close(code, reason);
    const groups = this.groupsOf(s);
    if (groups.length === 0) {
      this.finish(s.id);
      return;
    }
    signalGroups(groups, 'SIGCONT');
    signalGroups(groups, 'SIGTERM');
    this.ending.add(s.id);
    setTimeout(() => {
      signalGroups(liveGroups(groups), 'SIGKILL');
      this.finish(s.id);
    }, this.killAfterMs).unref();
  }

  private finish(id: string): void {
    this.ending.delete(id);
    this.apps.forget(id);
    this.host.close(id);
  }

  private async sweepRevoked(): Promise<void> {
    for (const s of [...this.live.values()]) {
      if (!s.ws) continue;
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
