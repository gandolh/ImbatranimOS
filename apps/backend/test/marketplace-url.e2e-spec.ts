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
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { get, type IncomingHttpHeaders, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import request from 'supertest';
import WebSocket from 'ws';

import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import {
  MAX_CLONE_BYTES,
  MAX_CLONE_ENTRIES,
  MarketplaceUrlApps,
} from '../src/modules/marketplace/marketplace-url.service';
import {
  MarketplaceService,
  type StepRunner,
} from '../src/modules/marketplace/marketplace.service';
import {
  PENDING_TTL_MS,
  PendingInspections,
} from '../src/modules/marketplace/pending-inspections';
import { deriveAppId } from '../src/modules/marketplace/source-url';
import { PtyModule } from '../src/modules/pty/pty.module';
import { securityHeaders } from '../src/security-headers';
import { UpgradeRoutesModule } from '../src/upgrade-routes';

/**
 * Apps installed from a URL end to end (brief 158), against a real git
 * repository on disk (`file://`, allowed by the test-only flag): a check
 * clones the commit and validates the manifest, install keeps the clone, and
 * the app's files are served only under a window's token with the sandbox's
 * headers, never on the native routes. The desktop's own headers and CORS
 * are mounted as `main.ts` mounts them, so the overrides are what is tested.
 */
const DESKTOP = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';
const RUNTIME = '/* the test runtime */\nexport {};\n';

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

function manifest(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    name: 'Hello',
    description: 'A prebuilt app from a URL.',
    meta: ['demo'],
    entry: 'dist/hello.mjs',
    window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
    capabilities: ['notify'],
    icon: 'sparkles',
    minSystemVersion: 2,
    ...extra,
  });
}

/**
 * A repository holding a good app at apps/hello (prebuilt: dist/ is
 * committed, with a dotfile and a symlink out beside the module) and one
 * asking for `fs` at apps/greedy.
 */
function makeRepo(dir: string): string {
  const hello = join(dir, 'apps', 'hello');
  mkdirSync(join(hello, 'dist'), { recursive: true });
  writeFileSync(join(hello, 'imbatranim.json'), manifest());
  writeFileSync(
    join(hello, 'dist', 'hello.mjs'),
    'export function mount(el) { el.textContent = "v1"; }\n',
  );
  writeFileSync(
    join(hello, 'dist', 'tiny.wasm'),
    Buffer.from([0, 97, 115, 109]),
  );
  writeFileSync(join(hello, 'dist', '.secret'), 'a dotfile');
  writeFileSync(join(hello, 'source.txt'), 'source, not output');
  symlinkSync('/etc/hostname', join(hello, 'dist', 'link.txt'));
  const greedy = join(dir, 'apps', 'greedy');
  mkdirSync(join(greedy, 'dist'), { recursive: true });
  writeFileSync(
    join(greedy, 'imbatranim.json'),
    manifest({ capabilities: ['notify', 'fs'] }),
  );
  writeFileSync(
    join(greedy, 'dist', 'hello.mjs'),
    'export function mount() {}\n',
  );
  const wide = join(dir, 'apps', 'wide');
  mkdirSync(join(wide, 'dist'), { recursive: true });
  writeFileSync(
    join(wide, 'imbatranim.json'),
    manifest({
      window: {
        defaultSize: { w: 2560, h: 1440 },
        minSize: { w: 640, h: 400 },
      },
    }),
  );
  writeFileSync(
    join(wide, 'dist', 'hello.mjs'),
    'export function mount() {}\n',
  );
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'v1');
  return git(dir, 'rev-parse', 'HEAD');
}

/**
 * A repository holding one app at apps/<name>, with a valid manifest and
 * entry plus `files` (path inside the app → content), committed on main.
 */
function makeAppRepo(
  dir: string,
  name: string,
  files: Record<string, string | Buffer>,
): string {
  const appDir = join(dir, 'apps', name);
  mkdirSync(join(appDir, 'dist'), { recursive: true });
  writeFileSync(join(appDir, 'imbatranim.json'), manifest());
  writeFileSync(
    join(appDir, 'dist', 'hello.mjs'),
    'export function mount() {}\n',
  );
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(appDir, path)), { recursive: true });
    writeFileSync(join(appDir, path), content);
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', name);
  return `file://${dir}#main/apps/${name}`;
}

function rawGet(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, headers: res.headers });
    }).on('error', reject);
  });
}

function wsStatus(
  url: string,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.on('open', () => {
      ws.close();
      resolve(101);
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

/** Every header contract B puts on a sandbox response. */
function expectSandboxHeaders(
  headers: IncomingHttpHeaders | Record<string, string>,
) {
  const csp = String(headers['content-security-policy']);
  expect(csp).toMatch(/^sandbox allow-scripts allow-pointer-lock; /);
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self' blob: 'wasm-unsafe-eval'");
  expect(csp).toContain("connect-src 'self' data: blob:");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).not.toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['access-control-allow-origin']).toBe('*');
  expect(headers['access-control-allow-credentials']).toBeUndefined();
  expect(headers['cross-origin-resource-policy']).toBe('cross-origin');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-dns-prefetch-control']).toBe('off');
}

interface Listed {
  id: string;
  runtime: string;
  source?: Record<string, unknown>;
  ref: string;
  installed: {
    ref: string;
    buildId: string;
    installedAt: number;
    entryPath?: string;
    missing: boolean;
  } | null;
  server: { state: string };
}

interface Inspected {
  pending: string;
  id: string;
  manifest: Record<string, unknown>;
  source: {
    url: string;
    repo: string;
    ref: string | null;
    commit: string;
    subdir: string | null;
  };
  current: { commit: string } | null;
}

describe('apps installed from a URL (e2e) — brief 158', () => {
  let work: string;
  let repo: string;
  let appsDir: string;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let port: number;
  let cookie: string;
  let commit: string;
  let helloUrl: string;
  let id: string;

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'imb-marketplace-url-'));
    repo = join(work, 'repo');
    mkdirSync(repo);
    commit = makeRepo(repo);
    helloUrl = `file://${repo}#main/apps/hello`;
    id = deriveAppId(`file://${repo}`, 'apps/hello');

    // One catalog app, never installed: it lists as native.
    const catalog = join(work, 'catalog');
    mkdirSync(catalog);
    writeFileSync(
      join(catalog, 'demo.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'demo',
        name: 'Demo',
        source: { repo: `file://${repo}`, ref: commit },
        type: 'static',
        runtime: 'native',
        build: { command: ['node', '-e', '0'], entry: 'dist/demo.mjs' },
        capabilities: [],
        minSystemVersion: 2,
      }),
    );

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
        IdentityModule,
        UpgradeRoutesModule,
        PtyModule,
        MarketplaceModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({
      logger: false,
    });
    // As main.ts: the desktop's headers on everything, then CORS.
    app.use(securityHeaders);
    app.setGlobalPrefix('api');
    app.enableCors({ origin: DESKTOP, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    // The real runtime belongs to its own chunk; this test serves its own.
    const urlApps = app.get(MarketplaceUrlApps);
    expect(urlApps.runtimePath).toBe(
      join(
        __dirname,
        '..',
        'src',
        'modules',
        'marketplace',
        'sandbox',
        'runtime.js',
      ),
    );
    urlApps.runtimePath = join(work, 'runtime.js');
    writeFileSync(urlApps.runtimePath, RUNTIME);
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
    await app.close();
    rmSync(work, { recursive: true, force: true });
  });

  const inspect = (url: string) =>
    http
      .post('/api/marketplace/url/inspect')
      .set('Cookie', cookie)
      .send({ url });

  const listed = async (): Promise<Listed[]> =>
    (
      (await http.get('/api/marketplace').set('Cookie', cookie).expect(200))
        .body as { apps: Listed[] }
    ).apps;

  const builds = (appId: string) =>
    readdirSync(appsDir).filter((n) => n.startsWith(`${appId}@`));

  const mint = async (appId: string): Promise<string> => {
    const res = await http
      .post(`/api/marketplace/apps/${appId}/sandbox`)
      .set('Cookie', cookie)
      .expect(200);
    const { path } = res.body as { path: string };
    expect(Object.keys(res.body as object)).toEqual(['path']);
    expect(path).toMatch(/^marketplace\/sandbox\/[A-Za-z0-9_-]+\/$/);
    return `/api/${path}`;
  };

  /**
   * Run `work` with the clone limits set to `limits`, and say which of the
   * fetch's steps ran (by label): a check refused before its checkout never
   * runs "Checking out", so it never writes a working tree.
   */
  const withLimits = async (
    limits: Partial<MarketplaceUrlApps['cloneLimits']>,
    work: () => Promise<void>,
  ): Promise<string[]> => {
    const urlApps = app.get(MarketplaceUrlApps);
    const marketplace = app.get(MarketplaceService);
    const fetchCommit = marketplace.fetchCommit.bind(
      marketplace,
    ) as MarketplaceService['fetchCommit'];
    const labels: string[] = [];
    const spy = jest
      .spyOn(marketplace, 'fetchCommit')
      .mockImplementation((dir, repoUrl, sha, step, fail, beforeCheckout) => {
        const counted: StepRunner = (label, ...rest) => {
          labels.push(label);
          return step(label, ...rest);
        };
        return fetchCommit(dir, repoUrl, sha, counted, fail, beforeCheckout);
      });
    const saved = urlApps.cloneLimits;
    urlApps.cloneLimits = { ...saved, ...limits };
    try {
      await work();
    } finally {
      urlApps.cloneLimits = saved;
      spy.mockRestore();
    }
    return labels;
  };

  const message = (res: { body: unknown }) =>
    (res.body as { message: string }).message;

  it('refuses the URL routes without a session', async () => {
    await http
      .post('/api/marketplace/url/inspect')
      .send({ url: helloUrl })
      .expect(401);
    await http
      .post('/api/marketplace/url/install')
      .send({ pending: 'x' })
      .expect(401);
    await http.delete('/api/marketplace/url/pending/x').expect(401);
    await http.post(`/api/marketplace/apps/${id}/sandbox`).expect(401);
    await http.delete('/api/marketplace/sandbox/x').expect(401);
  });

  it('refuses a host other than github.com, an unknown branch and a missing repository', async () => {
    const other = await inspect('https://gitlab.com/o/r').expect(400);
    expect((other.body as { message: string }).message).toBe(
      'Only github.com URLs can be installed for now.',
    );
    const branch = await inspect(`file://${repo}#nope/apps/hello`).expect(400);
    expect((branch.body as { message: string }).message).toMatch(
      /"nope\/apps\/hello"/,
    );
    const missing = await inspect(`file://${work}/no-such-repo`).expect(502);
    expect((missing.body as { message: string }).message).toMatch(
      /not found, or it is private/,
    );
    expect(
      existsSync(appsDir)
        ? readdirSync(appsDir).filter((n) => n.includes('@'))
        : [],
    ).toEqual([]);
  }, 30_000);

  it('refuses a manifest that asks for fs, naming it, and keeps no clone', async () => {
    const res = await inspect(`file://${repo}#main/apps/greedy`).expect(400);
    expect((res.body as { message: string }).message).toBe(
      'This app asks for system.fs, which an app installed from a URL cannot have. Only notify is allowed.',
    );
    expect(builds(deriveAppId(`file://${repo}`, 'apps/greedy'))).toEqual([]);
  }, 30_000);

  it('refuses a folder with no manifest and a folder that is not there', async () => {
    const none = await inspect(`file://${repo}#main/apps`).expect(400);
    expect((none.body as { message: string }).message).toMatch(
      /There is no imbatranim\.json in apps/,
    );
    const absent = await inspect(`file://${repo}#main/nowhere`).expect(400);
    expect((absent.body as { message: string }).message).toMatch(
      /nowhere is not a folder/,
    );
  }, 30_000);

  it('refuses a window larger than an app from a URL may open, saying the most', async () => {
    const res = await inspect(`file://${repo}#main/apps/wide`).expect(400);
    expect(message(res)).toBe(
      'This app asks for a 2560×1440 window. An app installed from a URL may open at most 1600×1000.',
    );
    expect(builds(deriveAppId(`file://${repo}`, 'apps/wide'))).toEqual([]);
  }, 30_000);

  describe('a clone too big to check out (measured before the checkout)', () => {
    it('keeps the real limits by default', () => {
      expect(app.get(MarketplaceUrlApps).cloneLimits).toEqual({
        bytes: MAX_CLONE_BYTES,
        entries: MAX_CLONE_ENTRIES,
      });
      expect(MAX_CLONE_BYTES).toBe(512 * 1024 * 1024);
      expect(MAX_CLONE_ENTRIES).toBe(20_000);
    });

    it('refuses identical blobs that would expand past the limit, and writes no working tree', async () => {
      // 24 copies of one 128 KB blob of zeros: a pack of a few hundred bytes,
      // a 3 MB checkout.
      const dir = join(work, 'zeros');
      const zeros = Buffer.alloc(128 * 1024);
      const files: Record<string, Buffer> = {};
      for (let i = 0; i < 24; i++) files[`dist/zeros-${i}.bin`] = zeros;
      const url = makeAppRepo(dir, 'zeros', files);
      const zerosId = deriveAppId(`file://${dir}`, 'apps/zeros');

      const steps = await withLimits({ bytes: 1024 * 1024 }, async () => {
        const res = await inspect(url).expect(400);
        expect(message(res)).toBe(
          'The files at that commit come to more than 1 MB, the most an app from a URL may be.',
        );
      });
      expect(steps).toEqual(['git init', 'Fetching the source']);
      expect(builds(zerosId)).toEqual([]);
    }, 30_000);

    it('refuses a commit with more files than the limit', async () => {
      const dir = join(work, 'many');
      const files: Record<string, string> = {};
      for (let i = 0; i < 30; i++) files[`dist/f-${i}.txt`] = `file ${i}\n`;
      const url = makeAppRepo(dir, 'many', files);

      const steps = await withLimits({ entries: 20 }, async () => {
        const res = await inspect(url).expect(400);
        expect(message(res)).toBe(
          'The repository holds more than 20 files at that commit, the most an app from a URL may have.',
        );
      });
      expect(steps).toEqual(['git init', 'Fetching the source']);
      expect(builds(deriveAppId(`file://${dir}`, 'apps/many'))).toEqual([]);
    }, 30_000);

    it('refuses fetched history over the limit before listing anything', async () => {
      const dir = join(work, 'heavy');
      const url = makeAppRepo(dir, 'heavy', {
        'dist/noise.bin': randomBytes(2 * 1024 * 1024),
      });

      const steps = await withLimits({ bytes: 1024 * 1024 }, async () => {
        const res = await inspect(url).expect(400);
        expect(message(res)).toBe(
          'The repository is over 1 MB at that commit, the most an app from a URL may be.',
        );
      });
      expect(steps).toEqual(['git init', 'Fetching the source']);
      expect(builds(deriveAppId(`file://${dir}`, 'apps/heavy'))).toEqual([]);
    }, 30_000);

    it("checks files out byte for byte, so the repository's .gitattributes cannot grow them past what was measured", async () => {
      // `ident` turns each 4-byte $Id$ into 47 bytes: 200 KB committed
      // would be 1.9 MB on disk, past the 1 MB limit, had it applied.
      const dir = join(work, 'ident');
      const ids = '$Id$\n'.repeat(40_000);
      const url = makeAppRepo(dir, 'ident', {
        '.gitattributes': '*.txt ident\n',
        'dist/ids.txt': ids,
      });
      const identId = deriveAppId(`file://${dir}`, 'apps/ident');

      const steps = await withLimits({ bytes: 1024 * 1024 }, async () => {
        const checked = (await inspect(url).expect(200)).body as Inspected;
        const [clone] = builds(identId);
        const out = join(appsDir, clone, 'apps', 'ident', 'dist', 'ids.txt');
        expect(statSync(out).size).toBe(ids.length);
        expect(readFileSync(out, 'utf8')).toBe(ids);
        await http
          .delete(`/api/marketplace/url/pending/${checked.pending}`)
          .set('Cookie', cookie)
          .expect(204);
      });
      expect(steps).toEqual([
        'git init',
        'Fetching the source',
        'Checking out',
      ]);
      expect(builds(identId)).toEqual([]);
    }, 30_000);
  });

  it('deletes a pending clone when it is cancelled or expires', async () => {
    const first = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(builds(id)).toHaveLength(1);
    await http
      .delete(`/api/marketplace/url/pending/${first.pending}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(builds(id)).toEqual([]);
    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: first.pending })
      .expect(404);

    const second = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(builds(id)).toHaveLength(1);
    await app.get(PendingInspections).sweep(Date.now() + PENDING_TTL_MS + 1);
    expect(builds(id)).toEqual([]);
    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: second.pending })
      .expect(404);
  }, 30_000);

  it('refuses a fifth pending check', async () => {
    const pendings: string[] = [];
    for (let i = 0; i < 4; i++) {
      pendings.push(
        ((await inspect(helloUrl).expect(200)).body as Inspected).pending,
      );
    }
    const fifth = await inspect(helloUrl).expect(429);
    expect((fifth.body as { message: string }).message).toMatch(
      /already waiting/,
    );
    for (const pending of pendings) {
      await http
        .delete(`/api/marketplace/url/pending/${pending}`)
        .set('Cookie', cookie)
        .expect(204);
    }
    expect(builds(id)).toEqual([]);
  }, 60_000);

  it('inspects, installs, and lists the app as sandboxed', async () => {
    const checked = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(checked.id).toBe(id);
    expect(checked.id).toMatch(/^x-[0-9a-f]{12}$/);
    expect(checked.pending).toMatch(/^[0-9a-f]{32}$/);
    expect(checked.source).toEqual({
      url: `file://${repo}#main/apps/hello`,
      repo: `file://${repo}`,
      ref: 'main',
      commit,
      subdir: 'apps/hello',
    });
    expect(checked.manifest).toEqual({
      name: 'Hello',
      description: 'A prebuilt app from a URL.',
      meta: ['demo'],
      icon: 'sparkles',
      capabilities: ['notify'],
      window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
      minSystemVersion: 2,
    });
    expect(checked.current).toBeNull();

    const installed = await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: checked.pending })
      .expect(200);
    expect((installed.body as Listed).runtime).toBe('sandboxed');
    expect(builds(id)).toHaveLength(1);
    // Installing used up the check.
    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: checked.pending })
      .expect(404);

    const apps = await listed();
    const hello = apps.find((a) => a.id === id)!;
    expect(hello).toMatchObject({
      id,
      name: 'Hello',
      runtime: 'sandboxed',
      type: 'static',
      capabilities: ['notify'],
      icon: 'sparkles',
      ref: commit,
      source: checked.source,
      job: null,
      server: { state: 'stopped' },
    });
    expect(hello.installed).toEqual({
      ref: commit,
      buildId: builds(id)[0].split('@')[1],
      installedAt: expect.any(Number) as number,
      missing: false,
    });
    expect(hello.installed).not.toHaveProperty('entryPath');
    expect(apps.find((a) => a.id === 'demo')?.runtime).toBe('native');
    expect(installed.body).toEqual(hello);
  }, 30_000);

  it('serves the shell, the runtime and the files under a token, with the sandbox headers and no cookie', async () => {
    const base = await mint(id);

    const shell = await http.get(base).set('Origin', 'null').expect(200);
    expect(shell.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(shell.headers['cache-control']).toBe('no-store');
    expectSandboxHeaders(shell.headers);
    expect(shell.text).toBe(
      [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<meta name="imb-entry" content="app/hello.mjs">',
        '<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style>',
        '<script type="module" src="runtime.js"></script></head><body></body></html>',
      ].join('\n'),
    );

    const runtime = await http
      .get(`${base}runtime.js`)
      .set('Origin', 'null')
      .expect(200);
    expect(runtime.headers['content-type']).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(runtime.headers['cache-control']).toBe('no-store');
    expectSandboxHeaders(runtime.headers);
    expect(runtime.text).toBe(RUNTIME);

    const entry = await http
      .get(`${base}app/hello.mjs`)
      .set('Origin', 'null')
      .expect(200);
    expect(entry.headers['content-type']).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(entry.headers['cache-control']).toBe('private, max-age=3600');
    expectSandboxHeaders(entry.headers);
    expect(entry.text).toContain('"v1"');

    const wasm = await http.get(`${base}app/tiny.wasm`).expect(200);
    expect(wasm.headers['content-type']).toBe('application/wasm');
    expectSandboxHeaders(wasm.headers);

    // The document only at its URL with the slash its relative URLs need.
    const slashless = await http.get(base.slice(0, -1)).expect(404);
    expectSandboxHeaders(slashless.headers);
  });

  it('answers 404 for a bad token, a climb, a dotfile and a symlink out, still with the sandbox headers', async () => {
    const base = await mint(id);
    const bad = `/api/marketplace/sandbox/${'A'.repeat(43)}/`;
    for (const path of [bad, `${bad}runtime.js`, `${bad}app/hello.mjs`]) {
      const res = await http.get(path).expect(404);
      expectSandboxHeaders(res.headers);
    }
    // With a session cookie it is still the token that decides.
    await http.get(`${bad}app/hello.mjs`).set('Cookie', cookie).expect(404);

    for (const path of [
      `${base}app/../source.txt`,
      `${base}app/..%2Fsource.txt`,
      `${base}app/%2E%2E/source.txt`,
      `${base}app/.secret`,
      `${base}app/link.txt`,
      `${base}app/nope.mjs`,
    ]) {
      const res = await rawGet(port, path);
      expect([path, res.status]).toEqual([path, 404]);
      expectSandboxHeaders(res.headers);
    }
    // No route at all: the router's 404, with the desktop's stricter headers.
    expect((await rawGet(port, `${base}app/`)).status).toBe(404);
  });

  it('revokes a token when its window closes', async () => {
    const base = await mint(id);
    await http.get(`${base}app/hello.mjs`).expect(200);
    const token = base.split('/')[4];
    await http
      .delete(`/api/marketplace/sandbox/${token}`)
      .set('Cookie', cookie)
      .expect(204);
    await http.get(`${base}app/hello.mjs`).expect(404);
  });

  it('mints a token only for an installed URL app', async () => {
    await http
      .post('/api/marketplace/apps/demo/sandbox')
      .set('Cookie', cookie)
      .expect(404);
    await http
      .post('/api/marketplace/apps/x-000000000000/sandbox')
      .set('Cookie', cookie)
      .expect(404);
    // The frame itself cannot mint one: no cookie, and its Origin is null.
    await http
      .post(`/api/marketplace/apps/${id}/sandbox`)
      .set('Origin', 'null')
      .set('Cookie', cookie)
      .expect(403);
  });

  it("never serves the URL app on the native runtime's routes", async () => {
    const hello = (await listed()).find((a) => a.id === id)!;
    const buildId = hello.installed!.buildId;
    await http
      .get(`/api/marketplace/apps/${id}/b/${buildId}/hello.mjs`)
      .set('Cookie', cookie)
      .expect(404);
    await http
      .post(`/api/marketplace/apps/${id}/install`)
      .set('Cookie', cookie)
      .expect(404);
    await http
      .post(`/api/marketplace/apps/${id}/lease`)
      .set('Cookie', cookie)
      .expect(404);
    await http
      .delete(
        `/api/marketplace/apps/${id}/lease/00000000-0000-4000-8000-000000000000`,
      )
      .set('Cookie', cookie)
      .expect(404);
    await http
      .get(`/api/marketplace/apps/${id}/server/health`)
      .set('Cookie', cookie)
      .expect(404);
    expect(
      await wsStatus(
        `ws://127.0.0.1:${port}/api/marketplace/apps/${id}/server/play`,
        {
          cookie,
          origin: DESKTOP,
        },
      ),
    ).toBe(404);
  });

  it('keeps the desktop headers on every other route', async () => {
    const res = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(res.headers['access-control-allow-origin']).toBe(DESKTOP);
    const sandbox = await http
      .post(`/api/marketplace/apps/${id}/sandbox`)
      .set('Cookie', cookie)
      .expect(200);
    expect(sandbox.headers['x-frame-options']).toBe('DENY');
  });

  it('updates: a new commit checks as an update, and installing it revokes the old tokens', async () => {
    const before = (await listed()).find((a) => a.id === id)!;
    const oldBase = await mint(id);
    await http.get(`${oldBase}app/hello.mjs`).expect(200);

    // Checking with nothing new reports the installed commit as current.
    const same = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(same.current).toEqual({ commit });
    expect(same.source.commit).toBe(commit);
    await http
      .delete(`/api/marketplace/url/pending/${same.pending}`)
      .set('Cookie', cookie)
      .expect(204);

    writeFileSync(
      join(repo, 'apps', 'hello', 'dist', 'hello.mjs'),
      'export function mount(el) { el.textContent = "v2"; }\n',
    );
    git(repo, 'commit', '-qam', 'v2');
    const next = git(repo, 'rev-parse', 'HEAD');

    const update = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(update.id).toBe(id);
    expect(update.current).toEqual({ commit });
    expect(update.source.commit).toBe(next);
    // Until the owner says Install, the old build is the one served.
    await http.get(`${oldBase}app/hello.mjs`).expect(200);
    expect(builds(id)).toHaveLength(2);

    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: update.pending })
      .expect(200);
    await http.get(`${oldBase}app/hello.mjs`).expect(404);
    await http.get(oldBase).expect(404);
    // The old build is gone; the one left is the new commit's.
    expect(builds(id)).toHaveLength(1);
    expect(builds(id)[0].startsWith(`${id}@${next.slice(0, 12)}-`)).toBe(true);
    expect(builds(id)[0]).not.toBe(`${id}@${before.installed!.buildId}`);

    const after = (await listed()).find((a) => a.id === id)!;
    expect(after.installed?.ref).toBe(next);
    expect(after.source?.commit).toBe(next);
    const newBase = await mint(id);
    expect(
      (await http.get(`${newBase}app/hello.mjs`).expect(200)).text,
    ).toContain('"v2"');
  }, 30_000);

  describe('a full commit id', () => {
    const notATip = () =>
      `That commit is not the tip of any branch or tag of file://${repo}. Install from a branch or tag URL instead.`;
    const checkCommit = async (sha: string): Promise<Inspected> => {
      const pinned = (
        await inspect(`file://${repo}#${sha}/apps/hello`).expect(200)
      ).body as Inspected;
      expect(pinned.id).toBe(id);
      expect(pinned.source.commit).toBe(sha);
      expect(pinned.source.ref).toBe(sha);
      await http
        .delete(`/api/marketplace/url/pending/${pinned.pending}`)
        .set('Cookie', cookie)
        .expect(204);
      return pinned;
    };

    it("installs from a branch's tip", async () => {
      await checkCommit(git(repo, 'rev-parse', 'main'));
    }, 30_000);

    it('refuses a commit no branch or tag ends at: an older one, or one from a fork', async () => {
      // v1 is in main's history but no longer its tip.
      expect(git(repo, 'rev-parse', 'main')).not.toBe(commit);
      const old = await inspect(`file://${repo}#${commit}/apps/hello`).expect(
        400,
      );
      expect(message(old)).toBe(notATip());

      // What GitHub does with a fork's commit: fetchable through the parent,
      // named there only by refs/pull/<n>/head, on no branch or tag.
      const fork = git(
        repo,
        'commit-tree',
        'HEAD^{tree}',
        '-p',
        'HEAD',
        '-m',
        "a fork's commit",
      );
      git(repo, 'update-ref', 'refs/pull/1/head', fork);
      const forked = await inspect(`file://${repo}#${fork}/apps/hello`).expect(
        400,
      );
      expect(message(forked)).toBe(notATip());
      expect(builds(id)).toHaveLength(1);
    }, 30_000);

    it("installs from an annotated tag's commit", async () => {
      git(repo, 'tag', '-a', 'v1', '-m', 'v1', commit);
      await checkCommit(commit);
      // The tag object's own id is not a commit to install.
      const tagObject = git(repo, 'rev-parse', 'v1');
      expect(tagObject).not.toBe(commit);
      const res = await inspect(
        `file://${repo}#${tagObject}/apps/hello`,
      ).expect(400);
      expect(message(res)).toBe(notATip());
    }, 30_000);
  });

  it('uninstalls: the row, the builds and the tokens go', async () => {
    const base = await mint(id);
    await http.get(`${base}app/hello.mjs`).expect(200);
    await http
      .delete(`/api/marketplace/apps/${id}`)
      .set('Cookie', cookie)
      .expect(204);
    await http.get(`${base}app/hello.mjs`).expect(404);
    await http.get(base).expect(404);
    expect(builds(id)).toEqual([]);
    expect((await listed()).some((a) => a.id === id)).toBe(false);
    await http
      .post(`/api/marketplace/apps/${id}/sandbox`)
      .set('Cookie', cookie)
      .expect(404);
    await http
      .delete(`/api/marketplace/apps/${id}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('lists a damaged row as a problem, serves nothing from it, and uninstalls it', async () => {
    const checked = (await inspect(helloUrl).expect(200)).body as Inspected;
    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: checked.pending })
      .expect(200);
    const base = await mint(id);
    await http.get(`${base}app/hello.mjs`).expect(200);

    const db = app.get(DbService).db;
    const original = db
      .prepare('SELECT * FROM marketplace_apps WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const listing = async () =>
      (await http.get('/api/marketplace').set('Cookie', cookie).expect(200))
        .body as {
        apps: Listed[];
        problems: { file: string; problem: string; appId?: string }[];
      };

    for (const [column, value, damaged] of [
      ['manifest', 'null', 'manifest'],
      ['manifest', '{', 'manifest'],
      ['source', '[]', 'source'],
      ['build_id', '../../../../etc', 'build id'],
      ['entry', '../../../../../etc/hostname', 'entry'],
      ['root', '../..', 'folder'],
    ] as const) {
      db.prepare(`UPDATE marketplace_apps SET ${column} = ? WHERE id = ?`).run(
        value,
        id,
      );
      const { apps, problems } = await listing();
      expect([column, apps.some((a) => a.id === id)]).toEqual([column, false]);
      expect(problems).toContainEqual({
        file: id,
        problem: `installed from a URL, but its stored ${damaged} is damaged: uninstall it`,
        appId: id,
      });
      // The catalog app still lists.
      expect(apps.some((a) => a.id === 'demo')).toBe(true);
      // No token for it, and the one minted before serves nothing.
      await http
        .post(`/api/marketplace/apps/${id}/sandbox`)
        .set('Cookie', cookie)
        .expect(404);
      await http.get(`${base}app/hello.mjs`).expect(404);
      await http.get(base).expect(404);
      db.prepare(`UPDATE marketplace_apps SET ${column} = ? WHERE id = ?`).run(
        original[column],
        id,
      );
    }
    // Restored, it serves again (under a new token: the old one was revoked).
    expect((await listing()).apps.some((a) => a.id === id)).toBe(true);
    await http.get(`${base}app/hello.mjs`).expect(404);
    await http.get(`${await mint(id)}app/hello.mjs`).expect(200);

    // Damaged, it can still be uninstalled: the row and its builds go.
    db.prepare(
      "UPDATE marketplace_apps SET manifest = 'null' WHERE id = ?",
    ).run(id);
    // A check sees no installed commit to update from.
    const again = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(again.current).toBeNull();
    await http
      .delete(`/api/marketplace/url/pending/${again.pending}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(builds(id)).toHaveLength(1);
    await http
      .delete(`/api/marketplace/apps/${id}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(builds(id)).toEqual([]);
    expect(
      db.prepare('SELECT id FROM marketplace_apps WHERE id = ?').get(id),
    ).toBeUndefined();
    const after = await listing();
    expect(after.problems.some((p) => p.file === id)).toBe(false);
    expect(after.apps.some((a) => a.id === id)).toBe(false);
  }, 30_000);
});
