import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import { MarketplaceService } from '../src/modules/marketplace/marketplace.service';
import { PtyModule } from '../src/modules/pty/pty.module';
import { UpgradeRoutesModule } from '../src/upgrade-routes';
import { kitDescriptor, makeKitRepo, type KitRepo } from './fixtures/kit-repo';
import { makeSuiteRepo, suiteDescriptor } from './fixtures/suite-repo';

/**
 * Kit apps (brief 163), end to end against a real git repository on disk: a
 * version 2 descriptor with `sharedKit` installs its apps with their
 * stylesheets; the listing says the shared kit version the live build was
 * made against and where each app's stylesheets are served; the row records
 * both; a build that leaves a listed stylesheet out fails and keeps the live
 * build; and a descriptor without `sharedKit` lists and records exactly as
 * brief 162 left it.
 */
const DESKTOP = 'http://localhost:5173';
const PASSWORD = 'correct horse battery';

interface Listed {
  id: string;
  descriptorId: string;
  sharedKit: number | null;
  ref: string;
  installed: {
    ref: string;
    buildId: string;
    entryPath?: string;
    stylePaths?: string[];
    missing: boolean;
  } | null;
  job: { state: string; reason?: string } | null;
}

describe('kit apps (e2e) — brief 163', () => {
  let work: string;
  let catalog: string;
  let appsDir: string;
  let repoUrl: string;
  let commits: KitRepo;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let cookie: string;

  const write = (d: Record<string, unknown> & { id: string }) =>
    writeFileSync(join(catalog, `${d.id}.json`), JSON.stringify(d));

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'imb-marketplace-kit-'));
    const repo = join(work, 'repo');
    commits = makeKitRepo(repo);
    repoUrl = `file://${repo}`;
    catalog = join(work, 'catalog');
    mkdirSync(catalog);

    write(kitDescriptor(repoUrl, commits.whole));
    // A mount suite beside it, from brief 162's repository.
    const suiteRepo = join(work, 'suite-repo');
    const suite = makeSuiteRepo(suiteRepo);
    write(suiteDescriptor(`file://${suiteRepo}`, suite.whole));
    // Refused: styles on a descriptor that is not a kit's.
    write(
      suiteDescriptor(`file://${suiteRepo}`, suite.whole, {
        id: 'styled',
        apps: [
          {
            id: 'styled-one',
            name: 'One',
            entry: 'alpha/app.mjs',
            styles: ['alpha/app.css'],
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
  const row = (id: string) =>
    app
      .get(DbService)
      .db.prepare('SELECT entry, entries FROM marketplace_apps WHERE id = ?')
      .get(id) as { entry: string; entries: string };

  it("lists a kit descriptor's shared kit version before it is installed, and refuses styles without one", async () => {
    const { apps, problems } = await listing();
    const notes = apps.find((a) => a.id === 'kit-notes')!;
    expect(notes).toMatchObject({
      descriptorId: 'kit',
      sharedKit: 1,
      installed: null,
    });
    expect(apps.find((a) => a.id === 'suite-alpha')?.sharedKit).toBeNull();
    expect(problems).toEqual([
      {
        file: 'styled.json',
        problem:
          'apps.0.styles: only a kit app (with sharedKit) may list styles',
      },
    ]);
  });

  it('installs the kit apps with their stylesheets, and serves them as CSS', async () => {
    await install('kit');
    const notes = await listed('kit-notes');
    const hello = await listed('kit-hello');
    expect(notes.job).toBeNull();
    expect(notes.installed?.missing).toBe(false);
    const base = `marketplace/apps/kit/b/${notes.installed!.buildId}`;
    expect(notes.installed?.entryPath).toBe(`${base}/notes/app.mjs`);
    expect(notes.installed?.stylePaths).toEqual([`${base}/kit.css`]);
    expect(hello.installed?.stylePaths).toEqual([`${base}/kit.css`]);
    expect(notes.sharedKit).toBe(1);

    const css = await http
      .get(`/api/${notes.installed!.stylePaths![0]}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(css.headers['content-type']).toMatch(/^text\/css/);
    expect(css.text).toContain('.border-heritage');
    const mod = await http
      .get(`/api/${notes.installed!.entryPath!}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(mod.headers['content-type']).toMatch(/^text\/javascript/);
    expect(mod.text).toContain('globalThis.__imbatranimShared');
    expect(mod.text).toContain('export function App');

    // Each app's module, stylesheets and shared kit version, as built.
    expect(row('kit').entry).toBe('dist/os');
    expect(JSON.parse(row('kit').entries)).toEqual({
      'kit-notes': {
        entry: 'notes/app.mjs',
        styles: ['kit.css'],
        sharedKit: 1,
      },
      'kit-hello': {
        entry: 'hello/app.mjs',
        styles: ['kit.css'],
        sharedKit: 1,
      },
    });
  }, 30_000);

  it('lists what the live build was made against until a reinstall', async () => {
    const before = await listed('kit-notes');
    write(kitDescriptor(repoUrl, commits.whole, { sharedKit: 99 }));
    try {
      expect((await listed('kit-notes')).sharedKit).toBe(1);
      await install('kit');
      const after = await listed('kit-notes');
      expect(after.installed?.buildId).not.toBe(before.installed?.buildId);
      expect(after.sharedKit).toBe(99);
    } finally {
      write(kitDescriptor(repoUrl, commits.whole));
      await install('kit');
    }
    expect((await listed('kit-notes')).sharedKit).toBe(1);
  }, 60_000);

  it('fails an update whose build leaves a stylesheet out, and keeps the live build', async () => {
    const before = await listed('kit-notes');
    write(kitDescriptor(repoUrl, commits.leavesOutStyle));
    try {
      await install('kit');
      const notes = await listed('kit-notes');
      expect(notes.job?.state).toBe('failed');
      expect(notes.job?.reason).toBe(
        'The build did not produce dist/os/kit.css',
      );
      expect(notes.installed?.buildId).toBe(before.installed?.buildId);
      expect(notes.installed?.ref).toBe(commits.whole);
      await http
        .get(`/api/${notes.installed!.stylePaths![0]}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(readdirSync(appsDir).filter((n) => n.startsWith('kit@'))).toEqual([
        `kit@${before.installed!.buildId}`,
      ]);
      expect(readFileSync(join(appsDir, 'kit.log'), 'utf8')).toContain(
        '✗ The build did not produce dist/os/kit.css',
      );
    } finally {
      write(kitDescriptor(repoUrl, commits.whole));
    }
  }, 30_000);

  it('records and lists a mount suite exactly as brief 162 did', async () => {
    await install('suite');
    const alpha = await listed('suite-alpha');
    expect(alpha.sharedKit).toBeNull();
    expect(alpha.installed?.stylePaths).toEqual([]);
    expect(JSON.parse(row('suite').entries)).toEqual({
      'suite-alpha': 'alpha/app.mjs',
      'suite-beta': 'beta/app.mjs',
    });
  }, 30_000);

  it('uninstalls the kit descriptor: both apps, and their stylesheets are no longer served', async () => {
    const notes = await listed('kit-notes');
    await http
      .delete('/api/marketplace/apps/kit')
      .set('Cookie', cookie)
      .expect(204);
    expect((await listed('kit-notes')).installed).toBeNull();
    expect((await listed('kit-hello')).installed).toBeNull();
    await http
      .get(`/api/${notes.installed!.stylePaths![0]}`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
