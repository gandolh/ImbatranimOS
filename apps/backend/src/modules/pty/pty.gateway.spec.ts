import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AddressInfo, type Server, type Socket } from 'net';
import { WebSocket } from 'ws';
import { PtyGateway } from './pty.gateway';
import { WardService } from '../ward/ward.service';
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
