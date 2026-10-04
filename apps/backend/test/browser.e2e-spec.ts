import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { get, type Server } from 'http';
import request from 'supertest';
import WebSocket from 'ws';

import { DbModule } from '../src/db/db.module';
import { BrowserModule } from '../src/modules/browser/browser.module';
import { BrowserProxyServer } from '../src/modules/browser/browser-proxy.server';
import { WardModule } from '../src/modules/ward/ward.module';

/**
 * The Browser's proxy origin and relay, end to end (brief 50): the second
 * listener, its fixed file list, the relay's authentication and origin rule,
 * and the egress filter seen through a real Wisp connection. Local sign-in
 * mode supplies the session, the way a standalone install would.
 */
const DESKTOP = 'http://localhost:5173';
const PROXY = 'http://localhost:0';
const PASSWORD = 'correct horse battery';

async function boot(): Promise<INestApplication<Server>> {
  const values: Record<string, unknown> = {
    DB_PATH: ':memory:',
    FRONTEND_URL: DESKTOP,
    BROWSER_PROXY_PORT: 0,
  };

  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: { get: (key: string) => values[key] },
      },
    ],
    exports: [ConfigService],
  })
  class TestConfig {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestConfig, DbModule, WardModule, BrowserModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

/** A Wisp v1 CONNECT packet. */
function connectPacket(
  streamId: number,
  host: string,
  port: number,
  type: 1 | 2 = 1,
): Buffer {
  const name = Buffer.from(host, 'utf8');
  const packet = Buffer.alloc(1 + 4 + 1 + 2 + name.length);
  packet.writeUInt8(0x01, 0);
  packet.writeUInt32LE(streamId, 1);
  packet.writeUInt8(type, 5);
  packet.writeUInt16LE(port, 6);
  name.copy(packet, 8);
  return packet;
}

/** GET a path exactly as written, with no client-side normalisation. */
function rawStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

/** Every frame the relay sent, collected from the first: one can arrive with the handshake. */
const received = new WeakMap<WebSocket, Buffer[]>();

function openRelay(
  port: number,
  headers: Record<string, string>,
): Promise<WebSocket | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/wisp/`, { headers });
    const frames: Buffer[] = [];
    received.set(ws, frames);
    ws.on('message', (data: Buffer) => frames.push(data));
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

describe('the Browser proxy origin (e2e) — brief 50', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let proxyPort: number;
  let cookie: string;

  beforeAll(async () => {
    app = await boot();
    http = request(app.getHttpServer());
    proxyPort = app.get(BrowserProxyServer).boundPort()!;
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    const signedIn = await http
      .post('/api/identity/local/sign-in')
      .send({ password: PASSWORD })
      .expect(204);
    cookie = [signedIn.headers['set-cookie']]
      .flat()
      .find((c) => c?.startsWith('imb_session='))!
      .split(';')[0];
  });
  afterAll(async () => {
    await app.close();
  });

  const proxy = () => request(`http://127.0.0.1:${proxyPort}`);

  it('tells a signed-in desktop where the proxy origin is, and nobody else', async () => {
    await http.get('/api/browser/config').expect(401);
    const res = await http
      .get('/api/browser/config')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual({ origin: PROXY });
  });

  it('serves the host page, framable by the desktop alone', async () => {
    const res = await proxy().get('/host.html').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toContain(
      `frame-ancestors ${DESKTOP}`,
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    await proxy()
      .get('/sw.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    await proxy()
      .get('/scram/scramjet.wasm.wasm')
      .expect(200)
      .expect('Content-Type', 'application/wasm');
  });

  it('serves nothing off its list: no API, no files, no traversal, no writes', async () => {
    for (const path of [
      '/',
      '/api/browser/profile',
      '/api/me',
      '/host.html/',
      '/HOST.HTML',
      '/static/host.js',
    ]) {
      await proxy().get(path).set('Cookie', cookie).expect(404);
    }
    // Sent raw: a client library would normalise these before they left.
    for (const path of [
      '/scram/../host.js',
      '/scram/%2e%2e/host.js',
      '/../../package.json',
    ]) {
      expect(await rawStatus(proxyPort, path)).toBe(404);
    }
    await proxy().post('/host.html').expect(405);
  });

  it('refuses the relay without a session, from another origin, and from the desktop', async () => {
    expect(await openRelay(proxyPort, { Origin: PROXY })).toBe(401);
    expect(
      await openRelay(proxyPort, {
        Cookie: cookie,
        Origin: 'http://evil.test',
      }),
    ).toBe(401);
    expect(
      await openRelay(proxyPort, { Cookie: cookie, Origin: DESKTOP }),
    ).toBe(401);
    expect(
      await openRelay(proxyPort, {
        Cookie: 'imb_session=forged',
        Origin: PROXY,
      }),
    ).toBe(401);
  });

  it('opens the relay for a session on the proxy origin, and refuses private destinations through it', async () => {
    const ws = await openRelay(proxyPort, { Cookie: cookie, Origin: PROXY });
    expect(ws).toBeInstanceOf(WebSocket);
    const relay = ws as WebSocket;
    const frames = received.get(relay)!;
    const closedStreams = () =>
      new Set(
        frames
          .filter((f) => f.readUInt8(0) === 0x04)
          .map((f) => f.readUInt32LE(1)),
      );

    const targets: [number, string, number, (1 | 2)?][] = [
      [1, '169.254.169.254', 80],
      [2, '::ffff:127.0.0.1', 80],
      [3, 'localhost', 8080],
      [4, '10.0.0.1', 443],
      [5, '127.1', 443],
      [6, '8.8.8.8', 53, 2],
      [7, 'example.com', 22],
    ];
    for (const [id, host, port, type] of targets) {
      relay.send(connectPacket(id, host, port, type));
    }
    const deadline = Date.now() + 5000;
    while (closedStreams().size < targets.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // The relay's greeting: CONTINUE on stream 0.
    expect(
      frames.some((f) => f.readUInt8(0) === 0x03 && f.readUInt32LE(1) === 0),
    ).toBe(true);
    // Every stream closed by the relay, none left open to a private address.
    expect([...closedStreams()].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    relay.close();
  });

  it('round-trips the profile, and refuses a write from the proxy origin', async () => {
    const jar = JSON.stringify({ a: { name: 'a', value: 'b' } });
    await http
      .put('/api/browser/profile')
      .set('Cookie', cookie)
      .send({ jar })
      .expect(204);
    const res = await http
      .get('/api/browser/profile')
      .set('Cookie', cookie)
      .expect(200);
    expect((res.body as { jar: string }).jar).toBe(jar);

    await http
      .put('/api/browser/profile')
      .set('Cookie', cookie)
      .set('Origin', PROXY)
      .send({ jar: '{}' })
      .expect(403);
    await http
      .put('/api/browser/profile')
      .set('Cookie', cookie)
      .send({ jar: 'not json' })
      .expect(400);
    await http.get('/api/browser/profile').expect(401);

    await http.delete('/api/browser/profile').set('Cookie', cookie).expect(204);
    const after = await http
      .get('/api/browser/profile')
      .set('Cookie', cookie)
      .expect(200);
    expect(after.body).toEqual({ jar: null, updatedAt: null });
  });
});

describe('the Browser when BROWSER_PROXY_PORT is unset (e2e)', () => {
  it('reports no proxy origin and listens on nothing', async () => {
    @Global()
    @Module({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({ DB_PATH: ':memory:', FRONTEND_URL: DESKTOP })[key],
          },
        },
      ],
      exports: [ConfigService],
    })
    class OffConfig {}
    const moduleRef = await Test.createTestingModule({
      imports: [OffConfig, DbModule, WardModule, BrowserModule],
    }).compile();
    const app = moduleRef.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();
    try {
      expect(app.get(BrowserProxyServer).origin).toBeNull();
      expect(app.get(BrowserProxyServer).boundPort()).toBeNull();
    } finally {
      await app.close();
    }
  });
});
