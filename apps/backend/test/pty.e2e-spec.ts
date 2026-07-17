import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { PtyGateway } from '../src/modules/pty/pty.gateway';
import { SessionService } from '../src/modules/auth/session.service';

/**
 * End-to-end proof of the terminal gateway against a REAL http server and a
 * REAL pty (login shell). SessionService is mocked so no DB is needed: the
 * token "good" is valid, everything else is rejected.
 */
describe('PtyGateway (e2e)', () => {
  let app: INestApplication;
  let url: string;

  const fakeSession = {
    token_hash: 'h',
    created_at: 0,
    last_seen: 0,
    expires_at: Date.now() + 60_000,
  };
  const sessionsMock = {
    validateFromRequest: (req: { headers?: { cookie?: string } }) =>
      req.headers?.cookie?.includes('imb_session=good') ? fakeSession : null,
    validate: (t: string) => (t === 'good' ? fakeSession : null),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PtyGateway,
        { provide: SessionService, useValue: sessionsMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'FRONTEND_URL' ? 'http://localhost:5173' : undefined,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    const addr = app.getHttpServer().address() as AddressInfo;
    url = `ws://127.0.0.1:${addr.port}/api/pty`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses an unauthenticated upgrade (no cookie)', async () => {
    const ws = new WebSocket(url);
    const status = await new Promise<number | string>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve('opened'));
      ws.on('error', (e) => resolve(String(e)));
    });
    ws.close();
    expect(status).toBe(401);
  });

  it('opens a real shell for an authenticated upgrade and echoes input', async () => {
    const ws = new WebSocket(url, { headers: { cookie: 'imb_session=good' } });
    const output = await new Promise<string>((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(
        () => reject(new Error(`no echo; got: ${buf}`)),
        8000,
      );
      ws.on('open', () => {
        ws.send(
          JSON.stringify({ type: 'input', data: 'echo IMBATRANIM_OK\r' }),
        );
      });
      ws.on('message', (data) => {
        buf += data.toString();
        if (buf.includes('IMBATRANIM_OK')) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
      ws.on('error', reject);
    });
    ws.close();
    expect(output).toContain('IMBATRANIM_OK');
  }, 15000);

  it('runs two independent shells at once', async () => {
    async function shellPid(cookie: string): Promise<string> {
      const ws = new WebSocket(url, { headers: { cookie } });
      return new Promise((resolve, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error('timeout')), 8000);
        ws.on('open', () =>
          ws.send(JSON.stringify({ type: 'input', data: 'echo PID=$$\r' })),
        );
        ws.on('message', (d) => {
          buf += d.toString();
          const m = buf.match(/PID=(\d+)/);
          if (m) {
            clearTimeout(timer);
            ws.close();
            resolve(m[1]);
          }
        });
        ws.on('error', reject);
      });
    }
    const [a, b] = await Promise.all([
      shellPid('imb_session=good'),
      shellPid('imb_session=good'),
    ]);
    expect(a).not.toBe(b); // two distinct shell processes
  }, 20000);
});
