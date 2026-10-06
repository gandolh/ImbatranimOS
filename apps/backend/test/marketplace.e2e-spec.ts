import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { get, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import WebSocket from 'ws';

import { DbModule } from '../src/db/db.module';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import { MarketplaceServers } from '../src/modules/marketplace/marketplace-servers.service';
import { MarketplaceService } from '../src/modules/marketplace/marketplace.service';
import { PtyModule } from '../src/modules/pty/pty.module';
import { WardModule } from '../src/modules/ward/ward.module';
import { UpgradeRoutesModule } from '../src/upgrade-routes';

/**
 * The marketplace end to end (brief 120), against a real git repository on
 * disk (a `file://` descriptor, allowed by the test-only flag): install clones
 * the pinned commit and runs the build, the build's output is served and
 * nothing outside it is, a service app's server is started, proxied behind the
 * session and stopped, and uninstall leaves nothing behind.
 */
const DESKTOP = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
}

/** A repository holding one app at games/demo, with a build and a server. */
function makeRepo(dir: string): string {
  const app = join(dir, 'games', 'demo');
  mkdirSync(app, { recursive: true });
  writeFileSync(
    join(app, 'build.mjs'),
    `import { mkdirSync, writeFileSync, symlinkSync } from 'fs';
mkdirSync('dist', { recursive: true });
writeFileSync('dist/demo.mjs', 'export function mount(el) { el.textContent = "demo"; }\\nexport function unmount() {}\\n');
writeFileSync('dist/env.json', JSON.stringify(process.env));
writeFileSync('secret.txt', 'source, not output');
symlinkSync('/etc/hostname', 'dist/link.txt');
console.log('built');
`,
  );
  writeFileSync(
    join(app, 'server.mjs'),
    `import { createServer } from 'http';
import { createRequire } from 'module';
const { WebSocketServer } = createRequire(import.meta.url)(${JSON.stringify(require.resolve('ws'))});
const server = createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  if (req.url.startsWith('/headers')) {
    res.setHeader('set-cookie', 'stolen=1');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.headers));
    return;
  }
  res.statusCode = 404; res.end();
});
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  ws.send(JSON.stringify({ url: req.url, headers: req.headers }));
  ws.on('message', (m) => ws.send('echo:' + m));
});
server.listen(Number(process.env.PORT), process.env.HOST);
`,
  );
  git(dir, 'init', '-q');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'demo');
  return git(dir, 'rev-parse', 'HEAD');
}

function descriptor(
  id: string,
  repo: string,
  ref: string,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    id,
    name: id[0].toUpperCase() + id.slice(1),
    source: { repo, ref, subdir: 'games/demo' },
    type: 'static',
    runtime: 'native',
    build: { command: ['node', 'build.mjs'], entry: 'dist/demo.mjs' },
    capabilities: ['notify'],
    minSystemVersion: 2,
    ...extra,
  };
}

function rawStatus(
  port: number,
  path: string,
  cookie: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers: { cookie } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

function openWs(
  url: string,
  headers: Record<string, string>,
): Promise<{ ws: WebSocket; first: string } | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.once('message', (data: Buffer) =>
      resolve({ ws, first: data.toString() }),
    );
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

interface Listed {
  id: string;
  installed: {
    buildId: string;
    entryPath: string;
    ref: string;
    missing: boolean;
  } | null;
  job: { state: string; reason?: string } | null;
}

describe('the marketplace (e2e) — brief 120', () => {
  let work: string;
  let appsDir: string;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let port: number;
  let cookie: string;
  let ref: string;

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'imb-marketplace-'));
    const repo = join(work, 'repo');
    mkdirSync(repo);
    ref = makeRepo(repo);
    const catalog = join(work, 'catalog');
    mkdirSync(catalog);
    const repoUrl = `file://${repo}`;
    const write = (d: { id: string }) =>
      writeFileSync(join(catalog, `${d.id}.json`), JSON.stringify(d));
    write(descriptor('demo', repoUrl, ref));
    write(
      descriptor('sim', repoUrl, ref, {
        type: 'service',
        server: {
          command: ['node', 'server.mjs'],
          portEnv: 'PORT',
          health: '/health',
        },
      }),
    );
    write(
      descriptor('broken', repoUrl, ref, {
        build: {
          command: ['node', '-e', 'console.log("nope"); process.exit(3)'],
          entry: 'dist/demo.mjs',
        },
      }),
    );
    write(descriptor('elsewhere', repoUrl, 'f'.repeat(40)));
    // Refused by the schema: a moving ref, and a shell string.
    writeFileSync(
      join(catalog, 'tagged.json'),
      JSON.stringify(descriptor('tagged', repoUrl, 'v1.0.0')),
    );
    writeFileSync(
      join(catalog, 'shell.json'),
      JSON.stringify(
        descriptor('shell', repoUrl, ref, {
          build: {
            command: 'node build.mjs; curl evil',
            entry: 'dist/demo.mjs',
          },
        }),
      ),
    );

    // A secret in the backend's environment that no build may see.
    process.env.WARD_TEST_SECRET = 'must-not-leak';

    const values: Record<string, unknown> = {
      DB_PATH: join(work, 'home', '.imbatranim', 'db.sqlite'),
      FRONTEND_URL: DESKTOP,
      MARKETPLACE_DIR: catalog,
      MARKETPLACE_ALLOW_LOCAL_REPOS: true,
    };
    mkdirSync(join(work, 'home', '.imbatranim'), { recursive: true });
    appsDir = join(work, 'home', '.imbatranim', 'apps');

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
      imports: [
        TestConfig,
        DbModule,
        WardModule,
        UpgradeRoutesModule,
        PtyModule,
        MarketplaceModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({
      logger: false,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    http = request(app.getHttpServer());

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
      .map((c: string) => c.split(';')[0])
      .join('; ');
  }, 30_000);

  afterAll(async () => {
    delete process.env.WARD_TEST_SECRET;
    await app.close();
    rmSync(work, { recursive: true, force: true });
  });

  const installAndWait = async (id: string) => {
    await http
      .post(`/api/marketplace/apps/${id}/install`)
      .set('Cookie', cookie)
      .expect(202);
    await app.get(MarketplaceService).settled();
    const list = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    const apps = (list.body as { apps: Listed[] }).apps;
    return apps.find((a) => a.id === id)!;
  };

  it('refuses every route without a session', async () => {
    await http.get('/api/marketplace').expect(401);
    await http.post('/api/marketplace/apps/demo/install').expect(401);
    await http.delete('/api/marketplace/apps/demo').expect(401);
    await http.post('/api/marketplace/apps/sim/lease').expect(401);
  });

  it('lists the catalog and reports the descriptors it refused', async () => {
    const res = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    const ids = ((res.body as { apps: unknown }).apps as { id: string }[])
      .map((a) => a.id)
      .sort();
    expect(ids).toEqual(['broken', 'demo', 'elsewhere', 'sim']);
    const refused = (
      (res.body as { problems: unknown }).problems as { file: string }[]
    )
      .map((p) => p.file)
      .sort();
    expect(refused).toEqual(['shell.json', 'tagged.json']);
  });

  it('refuses to install an id that is not in the catalog', async () => {
    await http
      .post('/api/marketplace/apps/tagged/install')
      .set('Cookie', cookie)
      .expect(404);
    await http
      .post('/api/marketplace/apps/..%2F..%2Fetc/install')
      .set('Cookie', cookie)
      .expect(404);
  });

  it('installs a static app at its pinned commit and serves only its output', async () => {
    const demo = await installAndWait('demo');
    expect(demo.job).toBeNull();
    expect(demo.installed?.ref).toBe(ref);
    expect(demo.installed?.missing).toBe(false);

    const entry = await http
      .get(`/api/${demo.installed!.entryPath}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(entry.headers['content-type']).toMatch(/^text\/javascript/);
    expect(entry.headers['cache-control']).toContain('immutable');
    expect(entry.text).toContain('export function mount');

    const base = `/api/${demo.installed!.entryPath}`.replace(/demo\.mjs$/, '');
    // The served file needs the session too.
    await http.get(`/api/${demo.installed!.entryPath}`).expect(401);
    // A symlink out of the build, the app's source, climbing, another build.
    await http.get(`${base}link.txt`).set('Cookie', cookie).expect(404);
    expect(await rawStatus(port, `${base}../secret.txt`, cookie)).toBe(404);
    expect(await rawStatus(port, `${base}..%2Fsecret.txt`, cookie)).toBe(404);
    await http
      .get(
        `/api/${demo.installed!.entryPath}`.replace(
          demo.installed!.buildId,
          'other',
        ),
      )
      .set('Cookie', cookie)
      .expect(404);
  }, 30_000);

  it('gives a build none of the backend environment, and its own HOME', async () => {
    const list = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    const demo = (
      (list.body as { apps: unknown }).apps as {
        id: string;
        installed: { entryPath: string };
      }[]
    ).find((a) => a.id === 'demo')!;
    const env = (
      await http
        .get(
          `/api/${demo.installed.entryPath}`.replace(/demo\.mjs$/, 'env.json'),
        )
        .set('Cookie', cookie)
        .expect(200)
    ).body as Record<string, string>;
    expect(env.WARD_TEST_SECRET).toBeUndefined();
    expect(env.DB_PATH).toBeUndefined();
    expect(env.HOME).toBe(join(appsDir, '.cache', 'home'));
    expect(env.npm_config_cache).toBe(join(appsDir, '.cache', 'npm'));
  });

  it('reports a failed build with its log and leaves no directory behind', async () => {
    const broken = await installAndWait('broken');
    expect(broken.installed).toBeNull();
    expect(broken.job?.state).toBe('failed');
    expect(broken.job?.reason).toMatch(/exited with 3/);
    const log = await http
      .get('/api/marketplace/apps/broken/log')
      .set('Cookie', cookie)
      .expect(200);
    expect(log.text).toContain('nope');
    expect(readdirSync(appsDir).filter((n) => n.startsWith('broken@'))).toEqual(
      [],
    );
  }, 30_000);

  it('fails cleanly when the pinned commit does not exist', async () => {
    const elsewhere = await installAndWait('elsewhere');
    expect(elsewhere.installed).toBeNull();
    expect(elsewhere.job?.state).toBe('failed');
    expect(elsewhere.job?.reason).toMatch(/^Fetching the source/);
  }, 30_000);

  it("runs a service app's server behind the session, and stops it when released", async () => {
    await installAndWait('sim');
    // No lease, no server: the proxy has nothing to reach.
    await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(503);
    await http
      .post('/api/marketplace/apps/demo/lease')
      .set('Cookie', cookie)
      .expect(409);

    const leased = await http
      .post('/api/marketplace/apps/sim/lease')
      .set('Cookie', cookie)
      .expect(201);
    const lease = (leased.body as { lease: string }).lease;

    const health = await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(200);
    expect(health.text).toBe('ok');
    // The app's server never sees the desktop's session, and cannot set a cookie on it.
    const headers = await http
      .get('/api/marketplace/apps/sim/server/headers')
      .set('Cookie', cookie)
      .expect(200);
    expect((headers.body as { cookie?: string }).cookie).toBeUndefined();
    expect(headers.headers['set-cookie']).toBeUndefined();

    const url = `ws://127.0.0.1:${port}/api/marketplace/apps/sim/server/play?room=1`;
    expect(await openWs(url, {})).toBe(401);
    expect(await openWs(url, { cookie, origin: 'http://evil.example' })).toBe(
      401,
    );
    const opened = await openWs(url, { cookie, origin: DESKTOP });
    if (typeof opened === 'number') throw new Error(`refused: ${opened}`);
    const hello = JSON.parse(opened.first) as {
      url: string;
      headers: Record<string, string>;
    };
    expect(hello.url).toBe('/play?room=1');
    expect(hello.headers.cookie).toBeUndefined();
    const echoed = new Promise<string>((resolve) =>
      opened.ws.once('message', (d: Buffer) => resolve(d.toString())),
    );
    opened.ws.send('hi');
    expect(await echoed).toBe('echo:hi');
    opened.ws.close();
    await new Promise((r) => opened.ws.once('close', r));

    await http
      .delete(`/api/marketplace/apps/sim/lease/${lease}`)
      .set('Cookie', cookie)
      .expect(204);
    // The sweep stops a server nobody holds.
    app.get(MarketplaceServers).sweep();
    await new Promise((r) => setTimeout(r, 500));
    await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(503);
  }, 60_000);

  it('uninstalls: the row, the build and the log go', async () => {
    await http
      .delete('/api/marketplace/apps/demo')
      .set('Cookie', cookie)
      .expect(204);
    await http
      .delete('/api/marketplace/apps/sim')
      .set('Cookie', cookie)
      .expect(204);
    const list = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    for (const a of (list.body as { apps: unknown }).apps as {
      id: string;
      installed: unknown;
    }[]) {
      if (a.id === 'demo' || a.id === 'sim') expect(a.installed).toBeNull();
    }
    const left = readdirSync(appsDir).filter(
      (n) => n.startsWith('demo') || n.startsWith('sim'),
    );
    expect(left).toEqual([]);
    expect(existsSync(join(appsDir, 'demo.log'))).toBe(false);
    await http
      .delete('/api/marketplace/apps/demo')
      .set('Cookie', cookie)
      .expect(404);
  });
});
