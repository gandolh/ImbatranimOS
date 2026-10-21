import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { get, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import { MarketplaceServers } from '../src/modules/marketplace/marketplace-servers.service';
import { MarketplaceService } from '../src/modules/marketplace/marketplace.service';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { PtyModule } from '../src/modules/pty/pty.module';
import { UpgradeRoutesModule } from '../src/upgrade-routes';
import {
  makeSuiteRepo,
  suiteDescriptor,
  type SuiteRepo,
} from './fixtures/suite-repo';

/**
 * One catalog entry, several apps (brief 162), end to end against a real git
 * repository on disk: a version 2 descriptor installs once (one clone, one
 * build, one directory, one row, one log) and lists one app per item; the
 * whole output is served, so the apps' shared chunk loads; a build that
 * leaves an entry out fails and keeps the live build; the routes take the
 * descriptor's id, and a suite's apps share one server.
 */
const DESKTOP = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';

interface Listed {
  id: string;
  descriptorId: string;
  descriptorName: string;
  name: string;
  multiInstance: boolean;
  opens: string[];
  ref: string;
  installed: {
    ref: string;
    buildId: string;
    entryPath?: string;
    missing: boolean;
  } | null;
  job: { state: string; reason?: string } | null;
  server: { state: string; port?: number };
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

describe('one catalog entry, several apps (e2e) — brief 162', () => {
  let work: string;
  let catalog: string;
  let appsDir: string;
  let repoUrl: string;
  let commits: SuiteRepo;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let port: number;
  let cookie: string;

  const write = (d: Record<string, unknown> & { id: string }) =>
    writeFileSync(join(catalog, `${d.id}.json`), JSON.stringify(d));

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'imb-marketplace-suite-'));
    const repo = join(work, 'repo');
    commits = makeSuiteRepo(repo);
    repoUrl = `file://${repo}`;
    catalog = join(work, 'catalog');
    mkdirSync(catalog);

    write(suiteDescriptor(repoUrl, commits.whole));
    // The same repository as a service suite: two apps, one server.
    write(
      suiteDescriptor(repoUrl, commits.whole, {
        id: 'sim',
        name: 'Sim',
        type: 'service',
        server: {
          command: ['node', 'server.mjs'],
          portEnv: 'PORT',
          health: '/health',
        },
        apps: [
          {
            id: 'sim-one',
            name: 'One',
            entry: 'alpha/app.mjs',
            capabilities: [],
          },
          {
            id: 'sim-two',
            name: 'Two',
            entry: 'beta/app.mjs',
            capabilities: [],
          },
        ],
      }),
    );
    // A version 1 descriptor beside them.
    write({
      schemaVersion: 1,
      id: 'solo',
      name: 'Solo',
      source: { repo: repoUrl, ref: commits.whole },
      type: 'static',
      runtime: 'native',
      build: { command: ['node', 'build.mjs'], entry: 'dist/os/beta/app.mjs' },
      capabilities: [],
      minSystemVersion: 2,
    });
    // Refused: an app id another descriptor already has.
    write(
      suiteDescriptor(repoUrl, commits.whole, {
        id: 'twin',
        apps: [
          {
            id: 'suite-alpha',
            name: 'Again',
            entry: 'alpha/app.mjs',
            capabilities: [],
          },
        ],
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
    await app.close();
    rmSync(work, { recursive: true, force: true });
  });

  const listing = async () => {
    const res = await http
      .get('/api/marketplace')
      .set('Cookie', cookie)
      .expect(200);
    return res.body as {
      apps: Listed[];
      problems: { file: string; problem: string }[];
    };
  };
  const listed = async (id: string) =>
    (await listing()).apps.find((a) => a.id === id)!;
  const install = async (id: string) => {
    await http
      .post(`/api/marketplace/apps/${id}/install`)
      .set('Cookie', cookie)
      .expect(202);
    await app.get(MarketplaceService).settled();
  };
  const builds = (id: string) =>
    readdirSync(appsDir).filter((n) => n.startsWith(`${id}@`));

  it('lists one app per item, and reports an app id that is already taken', async () => {
    const { apps, problems } = await listing();
    expect(apps.map((a) => a.id).sort()).toEqual([
      'sim-one',
      'sim-two',
      'solo',
      'suite-alpha',
      'suite-beta',
    ]);
    const alpha = apps.find((a) => a.id === 'suite-alpha')!;
    const beta = apps.find((a) => a.id === 'suite-beta')!;
    expect(alpha).toMatchObject({
      descriptorId: 'suite',
      descriptorName: 'Suite',
      name: 'Alpha',
      multiInstance: true,
      opens: ['md'],
      ref: commits.whole,
      installed: null,
    });
    expect(beta).toMatchObject({
      descriptorId: 'suite',
      multiInstance: false,
      opens: [],
    });
    // A version 1 app is its own descriptor.
    expect(apps.find((a) => a.id === 'solo')).toMatchObject({
      descriptorId: 'solo',
      descriptorName: 'Solo',
      multiInstance: false,
      opens: [],
    });
    expect(problems).toEqual([
      {
        file: 'twin.json',
        problem: 'the id suite-alpha is already used by suite.json',
      },
    ]);
  });

  it('takes the descriptor id on its routes, never an app id', async () => {
    await http
      .post('/api/marketplace/apps/suite-alpha/install')
      .set('Cookie', cookie)
      .expect(404);
    await http
      .post('/api/marketplace/apps/sim-one/lease')
      .set('Cookie', cookie)
      .expect(404);
    await http
      .delete('/api/marketplace/apps/suite-beta')
      .set('Cookie', cookie)
      .expect(404);
  });

  it('installs both apps with one build, and serves the whole output', async () => {
    await install('suite');
    expect(builds('suite')).toHaveLength(1);
    expect(readdirSync(appsDir).filter((n) => n.startsWith('suite-'))).toEqual(
      [],
    );
    expect(existsSync(join(appsDir, 'suite.log'))).toBe(true);
    const log = await http
      .get('/api/marketplace/apps/suite/log')
      .set('Cookie', cookie)
      .expect(200);
    expect(log.text).toContain('built 3 files');

    const alpha = await listed('suite-alpha');
    const beta = await listed('suite-beta');
    expect(alpha.job).toBeNull();
    expect(alpha.installed?.ref).toBe(commits.whole);
    expect(alpha.installed?.missing).toBe(false);
    expect(beta.installed?.buildId).toBe(alpha.installed?.buildId);
    const buildId = alpha.installed!.buildId;
    const base = `marketplace/apps/suite/b/${buildId}`;
    expect(alpha.installed?.entryPath).toBe(`${base}/alpha/app.mjs`);
    expect(beta.installed?.entryPath).toBe(`${base}/beta/app.mjs`);

    for (const path of [
      alpha.installed!.entryPath!,
      beta.installed!.entryPath!,
    ]) {
      const res = await http
        .get(`/api/${path}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/^text\/javascript/);
      expect(res.text).toContain("from '../shared.mjs'");
    }
    // The chunk the two apps share sits beside their entries, in the output.
    const shared = await http
      .get(`/api/${base}/shared.mjs`)
      .set('Cookie', cookie)
      .expect(200);
    expect(shared.text).toContain('export function paint');
    // Nothing outside the output, and not under an app's id.
    expect(
      await rawStatus(port, `/api/${base}/../source-only.txt`, cookie),
    ).toBe(404);
    await http
      .get(`/api/marketplace/apps/suite-alpha/b/${buildId}/alpha/app.mjs`)
      .set('Cookie', cookie)
      .expect(404);

    // One row, naming the output and each app's module.
    const row = app
      .get(DbService)
      .db.prepare('SELECT entry, entries FROM marketplace_apps WHERE id = ?')
      .get('suite') as { entry: string; entries: string };
    expect(row.entry).toBe('dist/os');
    expect(JSON.parse(row.entries)).toEqual({
      'suite-alpha': 'alpha/app.mjs',
      'suite-beta': 'beta/app.mjs',
    });
  }, 30_000);

  it('writes a version 1 row exactly as before: its entry, and no entries', async () => {
    await install('solo');
    const solo = await listed('solo');
    expect(solo.installed?.entryPath).toBe(
      `marketplace/apps/solo/b/${solo.installed!.buildId}/app.mjs`,
    );
    const row = app
      .get(DbService)
      .db.prepare('SELECT entry, entries FROM marketplace_apps WHERE id = ?')
      .get('solo') as { entry: string; entries: string | null };
    expect(row).toEqual({ entry: 'dist/os/beta/app.mjs', entries: null });
    await http
      .delete('/api/marketplace/apps/solo')
      .set('Cookie', cookie)
      .expect(204);
  }, 30_000);

  it('fails an update whose build leaves an entry out, and keeps the live build', async () => {
    const before = await listed('suite-alpha');
    write(suiteDescriptor(repoUrl, commits.leavesOutBeta));
    try {
      const outdated = await listed('suite-beta');
      expect(outdated.ref).toBe(commits.leavesOutBeta);
      expect(outdated.installed?.ref).toBe(commits.whole);

      await install('suite');
      const alpha = await listed('suite-alpha');
      const beta = await listed('suite-beta');
      for (const a of [alpha, beta]) {
        expect(a.job?.state).toBe('failed');
        expect(a.job?.reason).toBe(
          'The build did not produce dist/os/beta/app.mjs',
        );
        expect(a.installed?.buildId).toBe(before.installed?.buildId);
        expect(a.installed?.ref).toBe(commits.whole);
        expect(a.installed?.missing).toBe(false);
        await http
          .get(`/api/${a.installed!.entryPath!}`)
          .set('Cookie', cookie)
          .expect(200);
      }
      // The failed build's directory is gone; the live one is still there.
      expect(builds('suite')).toEqual([`suite@${before.installed!.buildId}`]);
      expect(readFileSync(join(appsDir, 'suite.log'), 'utf8')).toContain(
        '✗ The build did not produce dist/os/beta/app.mjs',
      );
    } finally {
      write(suiteDescriptor(repoUrl, commits.whole));
    }
  }, 30_000);

  it('lists an app added to the descriptor since the install as missing, until a reinstall', async () => {
    const d = suiteDescriptor(repoUrl, commits.whole);
    write({
      ...d,
      apps: [
        ...d.apps,
        {
          id: 'suite-gamma',
          name: 'Gamma',
          entry: 'gamma/app.mjs',
          capabilities: [],
        },
      ],
    });
    try {
      const gamma = await listed('suite-gamma');
      expect(gamma.installed?.missing).toBe(true);
      expect(gamma.installed?.entryPath).toBeUndefined();
      expect((await listed('suite-alpha')).installed?.missing).toBe(false);
    } finally {
      write(d);
    }
  });

  it('lists every app of a row whose entries are damaged as missing, without failing the listing', async () => {
    const db = app.get(DbService).db;
    const { entries } = db
      .prepare('SELECT entries FROM marketplace_apps WHERE id = ?')
      .get('suite') as { entries: string };
    try {
      for (const damaged of ['{nope', '[]', '{"suite-alpha":"../x.mjs"}']) {
        db.prepare('UPDATE marketplace_apps SET entries = ? WHERE id = ?').run(
          damaged,
          'suite',
        );
        const alpha = await listed('suite-alpha');
        expect(alpha.installed?.missing).toBe(true);
        expect(alpha.installed?.entryPath).toBeUndefined();
      }
    } finally {
      db.prepare('UPDATE marketplace_apps SET entries = ? WHERE id = ?').run(
        entries,
        'suite',
      );
    }
    expect((await listed('suite-alpha')).installed?.missing).toBe(false);
  });

  it("runs one server for a service suite, leased by every app's window under the descriptor's id", async () => {
    await install('sim');
    const lease = async (body: object = {}) =>
      (
        await http
          .post('/api/marketplace/apps/sim/lease')
          .set('Cookie', cookie)
          .send(body)
          .expect(201)
      ).body as { lease: string };
    // A window of each app.
    const one = await lease();
    const two = await lease();
    expect(two.lease).not.toBe(one.lease);
    await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(200);
    const [a, b] = [await listed('sim-one'), await listed('sim-two')];
    expect(a.server.state).toBe('up');
    expect(b.server).toEqual(a.server);

    // One window closing leaves the server to the other.
    await http
      .delete(`/api/marketplace/apps/sim/lease/${one.lease}`)
      .set('Cookie', cookie)
      .expect(204);
    app.get(MarketplaceServers).sweep();
    await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(200);

    await http
      .delete(`/api/marketplace/apps/sim/lease/${two.lease}`)
      .set('Cookie', cookie)
      .expect(204);
    app.get(MarketplaceServers).sweep();
    await new Promise((r) => setTimeout(r, 500));
    await http
      .get('/api/marketplace/apps/sim/server/health')
      .set('Cookie', cookie)
      .expect(503);
    await http
      .delete('/api/marketplace/apps/sim')
      .set('Cookie', cookie)
      .expect(204);
  }, 60_000);

  it('uninstalls the descriptor: both apps, the build and the log go', async () => {
    await http
      .delete('/api/marketplace/apps/suite')
      .set('Cookie', cookie)
      .expect(204);
    expect((await listed('suite-alpha')).installed).toBeNull();
    expect((await listed('suite-beta')).installed).toBeNull();
    expect(builds('suite')).toEqual([]);
    expect(existsSync(join(appsDir, 'suite.log'))).toBe(false);
    const rows = app
      .get(DbService)
      .db.prepare('SELECT id FROM marketplace_apps')
      .all();
    expect(rows).toEqual([]);
  });
});
