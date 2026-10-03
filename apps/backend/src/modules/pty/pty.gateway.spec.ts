import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AddressInfo, type Server, type Socket } from 'net';
import { WebSocket } from 'ws';
import * as pty from 'node-pty';
import { PtyGateway } from './pty.gateway';
import { MAX_SESSIONS } from './pty.constants';
import { WardService } from '../ward/ward.service';
import { WardFreshness } from '../ward/ward-freshness';
import { IMBATRANIMOS_APP_SLUG, type WardCaller } from '../ward/ward.types';

/**
 * The raw `'upgrade'` handler (brief 138), against a real HTTP server.
 *
 * Ward is a fake whose answers the test controls: `hold()` makes the next
 * `authenticate` wait on a promise the test resolves, which is the window an
 * unauthenticated client can reset the connection in.
 */
describe('PtyGateway upgrade handler', () => {
  let app: INestApplication<Server>;
  let port: number;

  const session: WardCaller = {
    active: true,
    subject: 'subject_owner',
    username: 'owner',
    grants: { [IMBATRANIMOS_APP_SLUG]: ['owner'] },
    sid: 'sid_good',
  };

  let held: Promise<WardCaller> | null = null;
  let release: () => void = () => undefined;
  let authStarted: () => void = () => undefined;
  /** Hold the next `authenticate` until `release()`; resolves once it starts. */
  const hold = () => {
    held = new Promise<WardCaller>((r) => {
      release = () => r(session);
    });
    return new Promise<void>((r) => {
      authStarted = r;
    });
  };

  const wardMock = {
    authenticate: (cookieHeader: string | undefined) => {
      if (!cookieHeader?.includes('ward_session=good')) {
        return Promise.reject(new Error('session is not active'));
      }
      const pending = held;
      held = null;
      authStarted();
      return pending ?? Promise.resolve(session);
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PtyGateway,
        WardFreshness,
        { provide: WardService, useValue: wardMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'FRONTEND_URL' ? 'http://localhost:5173' : undefined,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A raw upgrade request, written by hand so the test owns the socket. */
  const rawUpgrade = (path: string, cookie?: string): Socket => {
    const socket = connect(port, '127.0.0.1');
    socket.write(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        (cookie ? `Cookie: ${cookie}\r\n` : '') +
        '\r\n',
    );
    return socket;
  };

  /** Resolves with whether a real terminal opened and echoed. */
  const openTerminal = () =>
    new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/pty`, {
        headers: { cookie: 'ward_session=good' },
      });
      let buf = '';
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`no echo; got: ${buf}`));
      }, 8000);
      ws.on('open', () =>
        ws.send(JSON.stringify({ type: 'input', data: 'echo STILL_UP\r' })),
      );
      ws.on('message', (data) => {
        // This server only sends text frames.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        buf += data.toString();
        if (buf.includes('STILL_UP')) {
          clearTimeout(timer);
          ws.close();
          resolve(buf);
        }
      });
      ws.on('error', reject);
    });

  it('survives a client that resets the connection during authentication', async () => {
    const started = hold();
    const socket = rawUpgrade('/api/pty', 'ward_session=good');
    socket.on('error', () => undefined);
    await started;

    // An RST, not a FIN: the server's socket sees ECONNRESET while nothing
    // but this handler is listening to it.
    socket.resetAndDestroy();
    await new Promise((r) => setTimeout(r, 100));
    release();
    await new Promise((r) => setTimeout(r, 100));

    await expect(openTerminal()).resolves.toContain('STILL_UP');
  }, 15000);

  it('answers an upgrade to another path with 404 and closes it', async () => {
    const socket = rawUpgrade('/api/nope', 'ward_session=good');
    const result = await new Promise<{ head: string; closed: boolean }>(
      (resolve) => {
        let head = '';
        const timer = setTimeout(() => resolve({ head, closed: false }), 3000);
        socket.on('data', (d: Buffer) => {
          head += d.toString('latin1');
        });
        socket.on('close', () => {
          clearTimeout(timer);
          resolve({ head, closed: true });
        });
        socket.on('error', () => undefined);
      },
    );
    socket.destroy();
    expect(result.head.startsWith('HTTP/1.1 404')).toBe(true);
    expect(result.closed).toBe(true);
  });
});

/**
 * Brief 145 — the revocation sweep, against a fake Ward keyed by cookie.
 *
 * Token A is what the WebSocket opened with; token B is what the browser
 * rotated to, recorded by the REST guard in `WardFreshness`. The sweep is
 * called directly: driving its 30 s interval with fake timers would also fake
 * the timers inside `ws` and the PTY session.
 */
describe('PtyGateway revocation sweep', () => {
  let app: INestApplication<Server>;
  let gateway: PtyGateway;
  let freshness: WardFreshness;
  let url: string;
  const open: WebSocket[] = [];

  /** cookie → what Ward says about it. Absent = expired/unknown. */
  const ward = new Map<string, 'granted' | 'no-grant'>();
  const SID = 'sid_family';
  const caller = (granted: boolean): WardCaller => ({
    active: true,
    subject: 'subject_owner',
    username: 'owner',
    grants: granted ? { [IMBATRANIMOS_APP_SLUG]: ['owner'] } : {},
    sid: SID,
  });
  const wardMock = {
    authenticate: (cookieHeader: string | undefined) => {
      const verdict = ward.get(cookieHeader ?? '');
      return verdict
        ? Promise.resolve(caller(verdict === 'granted'))
        : Promise.reject(new Error('session is not active'));
    },
  };

  const sweep = () =>
    (
      gateway as unknown as { sweepRevoked: () => Promise<void> }
    ).sweepRevoked();

  beforeEach(async () => {
    ward.clear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PtyGateway,
        WardFreshness,
        { provide: WardService, useValue: wardMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'FRONTEND_URL' ? 'http://localhost:5173' : undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    gateway = moduleRef.get(PtyGateway);
    freshness = moduleRef.get(WardFreshness);
    url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/pty`;
  });

  afterEach(async () => {
    for (const ws of open.splice(0)) ws.terminate();
    await app.close();
  });

  /** Open a shell with `cookie`; resolves once the socket is open. */
  const shell = (cookie: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { cookie } });
      open.push(ws);
      ws.on('open', () => resolve(ws));
      ws.on('unexpected-response', (_req, res) =>
        reject(new Error(`refused ${res.statusCode}`)),
      );
      ws.on('error', reject);
    });

  /** The close code, or 'open' if the socket is still open after `ms`. */
  const closeCode = (ws: WebSocket, ms = 1000) =>
    new Promise<number | 'open'>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve(-1);
      const timer = setTimeout(() => resolve('open'), ms);
      ws.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

  it('(a) keeps a shell open when its token expired but the session rotated', async () => {
    ward.set('ward_session=A', 'granted');
    const ws = await shell('ward_session=A');

    ward.delete('ward_session=A'); // A's 15 minutes are up
    ward.set('ward_session=B', 'granted');
    freshness.note(SID, 'ward_session=B'); // what the REST guard records

    await sweep();
    expect(await closeCode(ws, 300)).toBe('open');
  });

  it('(b) closes the shell with 4401 when Ward reports the session inactive', async () => {
    ward.set('ward_session=A', 'granted');
    const ws = await shell('ward_session=A');
    freshness.note(SID, 'ward_session=B'); // B is no better: revoked too

    ward.clear();
    const closed = closeCode(ws);
    await sweep();
    expect(await closed).toBe(4401);
  });

  it('(c) closes the shell when the grant is removed', async () => {
    ward.set('ward_session=A', 'granted');
    const ws = await shell('ward_session=A');
    ward.set('ward_session=A', 'no-grant');

    const closed = closeCode(ws);
    await sweep();
    expect(await closed).toBe(4401);
  });

  it('(d) closes the shell when its token expired and no fresher one arrived', async () => {
    ward.set('ward_session=A', 'granted');
    const ws = await shell('ward_session=A');
    ward.delete('ward_session=A');

    const closed = closeCode(ws);
    await sweep();
    expect(await closed).toBe(4401);
  });

  it('(e) refuses a shell over MAX_SESSIONS with 503', async () => {
    ward.set('ward_session=A', 'granted');
    for (let i = 0; i < MAX_SESSIONS; i++) await shell('ward_session=A');
    await expect(shell('ward_session=A')).rejects.toThrow('refused 503');
  }, 30_000);

  it('(f) closes with 1011 when the shell cannot be spawned', async () => {
    ward.set('ward_session=A', 'granted');
    const spawn = jest.spyOn(pty, 'spawn').mockImplementation(() => {
      throw new Error('no shell here');
    });
    try {
      const ws = await shell('ward_session=A');
      expect(await closeCode(ws)).toBe(1011);
    } finally {
      spawn.mockRestore();
    }
  });

  it('forgets sessions with no live shell once their token is certainly expired', async () => {
    freshness.note('sid_gone', 'ward_session=old', Date.now() - 16 * 60_000);
    freshness.note('sid_recent', 'ward_session=new');
    await sweep();
    expect(freshness.latest('sid_gone')).toBeUndefined();
    expect(freshness.latest('sid_recent')).toBe('ward_session=new');
  });
});
