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
  OLD_FORMAT_REFUSAL,
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
 * Checking an app from a URL end to end, against a real git repository on
 * disk (`file://`, allowed by the test-only flag): the URL resolves to a
 * commit, the clone is measured before its checkout, the manifest is read,
 * and the clone is held for the owner's answer. Installing, trusting and
 * building are `marketplace-url-native.e2e-spec.ts`'s.
 *
 * Also what is left of the retired prebuilt path: a version 1 manifest is
 * refused at the check, the sandbox's routes are gone, and a sandboxed row
 * still in the database lists as no longer supported, runs nothing and
 * uninstalls. The desktop's own headers and CORS are mounted as `main.ts`
 * mounts them.
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

/** A version 2 manifest: an app built from source. The check never builds it. */
function manifest(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 2,
    name: 'Hello',
    description: 'An app from a URL.',
    type: 'static',
    build: { command: ['node', 'build.js'], entry: 'dist/hello.mjs' },
    capabilities: ['notify'],
    icon: 'sparkles',
    minSystemVersion: 2,
    ...extra,
  });
}

/** A prebuilt app's manifest, as the retired path read it. */
const OLD_MANIFEST = {
  schemaVersion: 1,
  name: 'Old',
  entry: 'dist/old.mjs',
  window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
  capabilities: ['notify'],
  icon: 'sparkles',
  minSystemVersion: 2,
};

/**
 * A repository holding an app at apps/hello and a prebuilt (version 1) one
 * at apps/old, with its built module committed as that path wanted.
 */
function makeRepo(dir: string): string {
  const hello = join(dir, 'apps', 'hello');
  mkdirSync(hello, { recursive: true });
  writeFileSync(join(hello, 'imbatranim.json'), manifest());
  writeFileSync(join(hello, 'build.js'), '// builds dist/hello.mjs\n');
  const old = join(dir, 'apps', 'old');
  mkdirSync(join(old, 'dist'), { recursive: true });
  writeFileSync(join(old, 'imbatranim.json'), JSON.stringify(OLD_MANIFEST));
  writeFileSync(join(old, 'dist', 'old.mjs'), 'export function mount() {}\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'v1');
  return git(dir, 'rev-parse', 'HEAD');
}

/**
 * A repository holding one app at apps/<name>, with a valid manifest plus
 * `files` (path inside the app → content), committed on main.
 */
function makeAppRepo(
  dir: string,
  name: string,
  files: Record<string, string | Buffer>,
): string {
  const appDir = join(dir, 'apps', name);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, 'imbatranim.json'), manifest());
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

/** The desktop's own policy, which every route answers with. */
function expectDesktopHeaders(
  headers: IncomingHttpHeaders | Record<string, string>,
) {
  const csp = String(headers['content-security-policy']);
  expect(csp).toMatch(/^default-src 'self'; /);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('sandbox');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['access-control-allow-origin']).not.toBe('*');
}

interface Listed {
  id: string;
  runtime: string;
}

interface Problem {
  file: string;
  problem: string;
  appId?: string;
  retired?: { name: string; source: Record<string, unknown> | null };
}

interface Inspected {
  pending: string;
  id: string;
  runtime: string;
  verified: boolean;
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

describe('apps from a URL: the check, and the retired prebuilt path (e2e)', () => {
  let work: string;
  let prevFilesRoot: string | undefined;
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
    // Uninstalling removes apps' cache folders from the home: this one.
    prevFilesRoot = process.env.FILES_ROOT;
    process.env.FILES_ROOT = join(work, 'home');
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
    if (prevFilesRoot === undefined) delete process.env.FILES_ROOT;
    else process.env.FILES_ROOT = prevFilesRoot;
  });

  const inspect = (url: string) =>
    http
      .post('/api/marketplace/url/inspect')
      .set('Cookie', cookie)
      .send({ url });

  const listing = async () =>
    (await http.get('/api/marketplace').set('Cookie', cookie).expect(200))
      .body as { apps: Listed[]; problems: Problem[] };

  const builds = (appId: string) =>
    existsSync(appsDir)
      ? readdirSync(appsDir).filter((n) => n.startsWith(`${appId}@`))
      : [];

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

  const cancel = (pending: string) =>
    http
      .delete(`/api/marketplace/url/pending/${pending}`)
      .set('Cookie', cookie)
      .expect(204);

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
  });

  it('refuses a host other than github.com, an unknown branch and a missing repository', async () => {
    const other = await inspect('https://gitlab.com/o/r').expect(400);
    expect(message(other)).toBe(
      'Only github.com URLs can be installed for now.',
    );
    const branch = await inspect(`file://${repo}#nope/apps/hello`).expect(400);
    expect(message(branch)).toMatch(/"nope\/apps\/hello"/);
    const missing = await inspect(`file://${work}/no-such-repo`).expect(502);
    expect(message(missing)).toMatch(/not found, or it is private/);
    expect(
      existsSync(appsDir)
        ? readdirSync(appsDir).filter((n) => n.includes('@'))
        : [],
    ).toEqual([]);
  }, 30_000);

  it('refuses a folder with no manifest and a folder that is not there', async () => {
    const none = await inspect(`file://${repo}#main/apps`).expect(400);
    expect(message(none)).toMatch(/There is no imbatranim\.json in apps/);
    const absent = await inspect(`file://${repo}#main/nowhere`).expect(400);
    expect(message(absent)).toMatch(/nowhere is not a folder/);
  }, 30_000);

  it('refuses a prebuilt (version 1) app at the check, in plain words, and keeps no clone', async () => {
    const res = await inspect(`file://${repo}#main/apps/old`).expect(400);
    expect(message(res)).toBe(OLD_FORMAT_REFUSAL);
    expect(OLD_FORMAT_REFUSAL).toBe(
      'This app uses the old format, which this OS no longer installs.',
    );
    expect(builds(deriveAppId(`file://${repo}`, 'apps/old'))).toEqual([]);
    expect(app.get(PendingInspections).size).toBe(0);
  }, 30_000);

  it('checks an app built from source and holds its clone for the answer', async () => {
    const checked = (await inspect(helloUrl).expect(200)).body as Inspected;
    expect(checked.id).toBe(id);
    expect(checked.id).toMatch(/^x-[0-9a-f]{12}$/);
    expect(checked.pending).toMatch(/^[0-9a-f]{32}$/);
    expect(checked).toMatchObject({ runtime: 'native', verified: false });
    expect(checked.source).toEqual({
      url: `file://${repo}#main/apps/hello`,
      repo: `file://${repo}`,
      ref: 'main',
      commit,
      subdir: 'apps/hello',
    });
    expect(checked.manifest).toMatchObject({
      name: 'Hello',
      description: 'An app from a URL.',
      icon: 'sparkles',
      capabilities: ['notify'],
    });
    expect(checked.current).toBeNull();
    expect(builds(id)).toHaveLength(1);
    // An unverified app is not installed without the owner's trust.
    await http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send({ pending: checked.pending })
      .expect(403);
    await cancel(checked.pending);
    expect(builds(id)).toEqual([]);
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
      await cancel(pinned.pending);
      return pinned;
    };

    beforeAll(() => {
      // main moves on, so the first commit is no longer its tip.
      writeFileSync(join(repo, 'apps', 'hello', 'build.js'), '// v2\n');
      git(repo, 'commit', '-qam', 'v2');
    });

    it("checks a branch's tip", async () => {
      await checkCommit(git(repo, 'rev-parse', 'main'));
    }, 30_000);

    it('refuses a commit no branch or tag ends at: an older one, or one from a fork', async () => {
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
      expect(builds(id)).toEqual([]);
    }, 30_000);

    it("checks an annotated tag's commit", async () => {
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

  describe('the sandbox is gone', () => {
    const token = 'A'.repeat(43);

    it('answers 404 on its routes, with a session or without, under the desktop headers', async () => {
      for (const [method, path] of [
        ['post', `/api/marketplace/apps/${id}/sandbox`],
        ['post', '/api/marketplace/apps/demo/sandbox'],
        ['delete', `/api/marketplace/sandbox/${token}`],
        ['get', `/api/marketplace/sandbox/${token}/`],
        ['get', `/api/marketplace/sandbox/${token}/runtime.js`],
        ['get', `/api/marketplace/sandbox/${token}/app/hello.mjs`],
      ] as const) {
        for (const session of [true, false]) {
          const req = http[method](path);
          const res = await (session ? req.set('Cookie', cookie) : req);
          expect([method, path, session, res.status]).toEqual([
            method,
            path,
            session,
            404,
          ]);
          expectDesktopHeaders(res.headers);
        }
      }
    });

    it('keeps the desktop headers on the routes that remain', async () => {
      const list = await http
        .get('/api/marketplace')
        .set('Cookie', cookie)
        .expect(200);
      expectDesktopHeaders(list.headers);
      expect(list.headers['access-control-allow-origin']).toBe(DESKTOP);
      const checked = await inspect(helloUrl).expect(200);
      expectDesktopHeaders(checked.headers);
      await cancel((checked.body as Inspected).pending);
      // A 404 the router answers has them too.
      expectDesktopHeaders(
        (await rawGet(port, '/api/marketplace/nope')).headers,
      );
    }, 30_000);
  });

  describe('a sandboxed install left from before', () => {
    const oldId = () => deriveAppId(`file://${repo}`, 'apps/old');
    const buildId = () => `${commit.slice(0, 12)}-0123abcd`;
    const oldSource = () => ({
      url: `file://${repo}#main/apps/old`,
      repo: `file://${repo}`,
      ref: 'main',
      commit,
      subdir: 'apps/old',
    });

    beforeAll(() => {
      // As the retired install wrote it: the row, and the clone it served.
      const dist = join(
        appsDir,
        `${oldId()}@${buildId()}`,
        'apps',
        'old',
        'dist',
      );
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'old.mjs'), 'export function mount() {}\n');
      app
        .get(DbService)
        .db.prepare(
          `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, entries, installed_at, runtime, source, manifest)
           VALUES (?, ?, ?, 'apps/old', 'dist/old.mjs', NULL, 1, 'sandboxed', ?, ?)`,
        )
        .run(
          oldId(),
          commit,
          buildId(),
          JSON.stringify(oldSource()),
          JSON.stringify(OLD_MANIFEST),
        );
    });

    it('lists as no longer supported, with its name and source, never as an app', async () => {
      const { apps, problems } = await listing();
      expect(apps.some((a) => a.id === oldId())).toBe(false);
      expect(apps.find((a) => a.id === 'demo')?.runtime).toBe('native');
      expect(problems).toContainEqual({
        file: oldId(),
        problem:
          'Old is a prebuilt app from a URL, which this OS no longer supports: uninstall it',
        appId: oldId(),
        retired: { name: 'Old', source: oldSource() },
      });
    });

    it('lists even when its row no longer reads, by its id', async () => {
      const db = app.get(DbService).db;
      db.prepare(
        "UPDATE marketplace_apps SET manifest = '{', source = 'null' WHERE id = ?",
      ).run(oldId());
      try {
        const { problems } = await listing();
        expect(problems.find((p) => p.file === oldId())).toEqual({
          file: oldId(),
          problem: `${oldId()} is a prebuilt app from a URL, which this OS no longer supports: uninstall it`,
          appId: oldId(),
          retired: { name: oldId(), source: null },
        });
      } finally {
        db.prepare(
          'UPDATE marketplace_apps SET manifest = ?, source = ? WHERE id = ?',
        ).run(
          JSON.stringify(OLD_MANIFEST),
          JSON.stringify(oldSource()),
          oldId(),
        );
      }
    });

    it("can't open: no file, build, lease or server of it is reachable", async () => {
      const x = oldId();
      await http
        .get(`/api/marketplace/apps/${x}/b/${buildId()}/old.mjs`)
        .set('Cookie', cookie)
        .expect(404);
      await http
        .post(`/api/marketplace/apps/${x}/install`)
        .set('Cookie', cookie)
        .expect(404);
      await http
        .post(`/api/marketplace/apps/${x}/lease`)
        .set('Cookie', cookie)
        .send({})
        .expect(404);
      await http
        .delete(
          `/api/marketplace/apps/${x}/lease/00000000-0000-4000-8000-000000000000`,
        )
        .set('Cookie', cookie)
        .expect(404);
      await http
        .get(`/api/marketplace/apps/${x}/server/health`)
        .set('Cookie', cookie)
        .expect(404);
      await http
        .post(`/api/marketplace/apps/${x}/sandbox`)
        .set('Cookie', cookie)
        .expect(404);
      expect(
        await wsStatus(
          `ws://127.0.0.1:${port}/api/marketplace/apps/${x}/server/play`,
          { cookie, origin: DESKTOP },
        ),
      ).toBe(404);
      // Without a session the upgrade is refused before the app is looked
      // at: what is installed is nobody's business before sign-in.
      expect(
        await wsStatus(
          `ws://127.0.0.1:${port}/api/marketplace/apps/${x}/server/play`,
          { origin: DESKTOP },
        ),
      ).toBe(401);
    });

    it('is refused at the check if its URL is pasted again, and stays as it was', async () => {
      const res = await inspect(`file://${repo}#main/apps/old`).expect(400);
      expect(message(res)).toBe(OLD_FORMAT_REFUSAL);
      expect(builds(oldId())).toEqual([`${oldId()}@${buildId()}`]);
    }, 30_000);

    it('uninstalls: the row and its files go', async () => {
      const x = oldId();
      expect(builds(x)).toHaveLength(1);
      await http
        .delete(`/api/marketplace/apps/${x}`)
        .set('Cookie', cookie)
        .expect(204);
      expect(builds(x)).toEqual([]);
      expect(
        app
          .get(DbService)
          .db.prepare('SELECT id FROM marketplace_apps WHERE id = ?')
          .get(x),
      ).toBeUndefined();
      expect((await listing()).problems.some((p) => p.file === x)).toBe(false);
      await http
        .delete(`/api/marketplace/apps/${x}`)
        .set('Cookie', cookie)
        .expect(404);
    });
  });
});
