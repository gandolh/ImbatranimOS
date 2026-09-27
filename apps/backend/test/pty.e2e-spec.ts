import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo, Server } from 'net';
import { WebSocket } from 'ws';
import { PtyGateway } from '../src/modules/pty/pty.gateway';
import { WardService } from '../src/modules/ward/ward.service';
import { IMBATRANIMOS_APP_SLUG } from '../src/modules/ward/ward.types';

/**
 * End-to-end proof of the terminal gateway against a REAL http server and a
 * REAL pty (login shell). Ward is faked so no DB and no network are needed: the
 * token "good" is valid, everything else is rejected.
 */
describe('PtyGateway (e2e)', () => {
  let app: INestApplication<Server>;
  let url: string;

  const fakeSession = {
    active: true as const,
    subject: 'subject_owner',
    username: 'owner',
    grants: { [IMBATRANIMOS_APP_SLUG]: ['owner'] },
    sid: 'sid_good',
  };
  /**
   * A Ward that recognises one cookie and grants this app's slug for it.
   *
   * The grant is part of the fixture rather than an afterthought:
   * `authorizeUpgrade` checks it, and a fake that returned a session without
   * one would make every test here fail for the right reason and the wrong
   * one.
   */
  const wardMock = {
    authenticate: (cookieHeader: string | undefined) =>
      cookieHeader?.includes('ward_session=good')
        ? Promise.resolve(fakeSession)
        : Promise.reject(new Error('session is not active')),
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
    const ws = new WebSocket(url, { headers: { cookie: 'ward_session=good' } });
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
        // ws's `RawData` union includes `ArrayBuffer`, which falls back to
        // Object's default toString(); this test server only ever sends
        // text frames (Buffer), so the runtime value is always meaningfully
        // stringified even though the type can't express that narrowing.
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
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
          // Same rationale as the echo test above: RawData's ArrayBuffer
          // member has no custom toString, but this server only sends text.
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
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
      shellPid('ward_session=good'),
      shellPid('ward_session=good'),
    ]);
    expect(a).not.toBe(b); // two distinct shell processes
  }, 20000);
});
