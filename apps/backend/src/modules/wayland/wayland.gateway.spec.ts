import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo, Server } from 'net';
import { WebSocket, type RawData } from 'ws';
import { PtyGateway } from '../pty/pty.gateway';
import { LocalIdentityService } from '../auth/ws-auth';
import type { Caller } from '../identity/identity.types';
import { UpgradeRoutes } from '../../upgrade-routes';
import { WaylandGateway } from './wayland.gateway';
import {
  WaylandHostService,
  type SessionListener,
} from './wayland-host.service';
import type { HostInbound } from './wayland.protocol';

const SESSION = 'abcdefghijklmnop';

/** Stands in for the host process: records what the gateway asks of it. */
class FakeHost {
  listeners = new Map<string, SessionListener>();
  sent: HostInbound[] = [];
  opened: { session: string; width: number; height: number }[] = [];
  closed: string[] = [];
  unavailable: string | null = null;

  open(
    session: string,
    width: number,
    height: number,
    listener: SessionListener,
  ) {
    if (this.unavailable) return this.unavailable;
    this.opened.push({ session, width, height });
    this.listeners.set(session, listener);
    return null;
  }
  close(session: string) {
    this.closed.push(session);
    this.listeners.delete(session);
  }
  send(m: HostInbound) {
    this.sent.push(m);
  }
}

describe('WaylandGateway', () => {
  let app: INestApplication<Server>;
  let port: number;
  let host: FakeHost;
  const caller: Caller = { subject: 's', username: 'owner', sid: 'sid' };

  beforeEach(async () => {
    host = new FakeHost();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PtyGateway,
        WaylandGateway,
        UpgradeRoutes,
        { provide: WaylandHostService, useValue: host },
        {
          provide: LocalIdentityService,
          useValue: {
            authenticate: (cookie: string | undefined) =>
              cookie?.includes('imb_session=good')
                ? Promise.resolve(caller)
                : Promise.reject(new Error('no session')),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'FRONTEND_URL' ? 'http://localhost:5173' : undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterEach(async () => {
    await app.close();
  });

  const url = (q: string) => `ws://127.0.0.1:${port}/api/wayland?${q}`;
  const signedIn = { headers: { cookie: 'imb_session=good' } };

  /** Collect a socket's messages and its close. */
  function open(q: string, opts: object = signedIn) {
    const ws = new WebSocket(url(q), opts);
    const messages: { text?: unknown; binary?: Buffer }[] = [];
    ws.on('message', (data: RawData, isBinary: boolean) => {
      const buf = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as ArrayBuffer);
      messages.push(
        isBinary ? { binary: buf } : { text: JSON.parse(buf.toString('utf8')) },
      );
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      ws.on('close', (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      ),
    );
    const opened = new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('unexpected-response', (_req, res) =>
        reject(new Error(String(res.statusCode))),
      );
      ws.on('error', reject);
    });
    return { ws, messages, closed, opened };
  }

  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(check()).toBe(true);
  };

  it('refuses an upgrade without a sign-in', async () => {
    const c = open(`session=${SESSION}`, {});
    await expect(c.opened).rejects.toThrow('401');
    expect(host.opened).toEqual([]);
  });

  it('refuses a missing or unsafe session id before checking the sign-in', async () => {
    await expect(open('width=10').opened).rejects.toThrow('400');
    await expect(open('session=..%2F..%2Fetc').opened).rejects.toThrow('400');
  });

  it("opens the session's display at the tab's viewport and relays its windows", async () => {
    const c = open(`session=${SESSION}&width=1280&height=720`);
    await c.opened;
    await until(() => host.opened.length === 1);
    expect(host.opened[0]).toEqual({
      session: SESSION,
      width: 1280,
      height: 720,
    });

    const l = host.listeners.get(SESSION)!;
    l.message({
      type: 'toplevel_created',
      session: SESSION,
      toplevel: 3,
      title: 'foot',
      app_id: 'foot',
      width: 700,
      height: 474,
    });
    const body = Buffer.alloc(14);
    body.writeUInt32LE(3, 0);
    l.frame(body);
    await until(() => c.messages.length === 2);
    expect(c.messages[0].text).toEqual({
      type: 'toplevel_created',
      toplevel: 3,
      title: 'foot',
      app_id: 'foot',
      width: 700,
      height: 474,
    });
    expect(c.messages[1].binary?.[0]).toBe(2);
    expect(c.messages[1].binary?.subarray(1)).toEqual(body);
    // The socket drained at once, so the window may send its next frame.
    expect(host.sent).toContainEqual({
      type: 'frame_ack',
      session: SESSION,
      toplevel: 3,
    });

    c.ws.send(JSON.stringify({ type: 'viewport', width: 800, height: 600 }));
    await until(() => host.sent.some((m) => m.type === 'output'));
    expect(host.sent).toContainEqual({
      type: 'output',
      session: SESSION,
      width: 800,
      height: 600,
    });

    c.ws.close();
    await until(() => host.closed.includes(SESSION));
  });

  it('keeps one socket per session: a second one is told to pick a new id', async () => {
    const first = open(`session=${SESSION}`);
    await first.opened;
    const second = open(`session=${SESSION}`);
    expect((await second.closed).code).toBe(4409);
    expect(host.opened).toHaveLength(1);
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
    first.ws.close();
    await first.closed;
  });

  it('tells the tab when Linux apps are unavailable', async () => {
    host.unavailable = 'XDG_RUNTIME_DIR is not set';
    const c = open(`session=${SESSION}`);
    const { code } = await c.closed;
    expect(code).toBe(4503);
    expect(c.messages[0].text).toEqual({
      type: 'unavailable',
      reason: 'XDG_RUNTIME_DIR is not set',
    });
  });

  it('closes the socket when the host goes away', async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    host.listeners.get(SESSION)!.gone('exited (1)');
    expect((await c.closed).code).toBe(4503);
  });
});
