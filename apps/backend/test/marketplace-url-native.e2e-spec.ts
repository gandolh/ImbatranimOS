import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { installGroupOf } from '../src/modules/app-identity/install-group';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { MarketplaceModule } from '../src/modules/marketplace/marketplace.module';
import { MarketplaceService } from '../src/modules/marketplace/marketplace.service';
import { deriveAppId } from '../src/modules/marketplace/source-url';
import { PtyModule } from '../src/modules/pty/pty.module';
import { UpgradeRoutesModule } from '../src/upgrade-routes';

/**
 * Apps from a URL that build from source and run natively, end to end,
 * against real git repositories on disk (`file://`, allowed by the test-only
 * flag): a verified commit installs without the owner's trust, any other
 * commit only with it, each new commit asks again, a verified app updates as
 * the verified list moves, and the build is served on the native routes as
 * a catalog app's is.
 */
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

/** A build that writes `dist/<name>.mjs` holding `version.txt`'s text. */
const BUILD_JS = `
const fs = require('fs');
const [name, fails] = process.argv.slice(2);
if (fails) process.exit(1);
fs.mkdirSync('dist', { recursive: true });
const v = fs.readFileSync('version.txt', 'utf8').trim();
fs.writeFileSync('dist/' + name + '.mjs', 'export const version = ' + JSON.stringify(v) + ';\\n');
`;

function nativeManifest(name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 2,
    name: name[0].toUpperCase() + name.slice(1),
    description: 'Built from source.',
    type: 'static',
    build: { command: ['node', 'build.js', name], entry: `dist/${name}.mjs` },
    capabilities: ['fs', 'notify'],
    icon: 'notebook',
    minSystemVersion: 2,
    ...extra,
  });
}

function writeApp(dir: string, files: Record<string, string>) {
  mkdirSync(dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(dir, path), text);
  }
}

interface Listed {
  id: string;
  descriptorId: string;
  runtime: string;
  ref: string;
  capabilities: string[];
  source?: { commit: string; repo: string; subdir: string | null };
  trust?: { by: string; at: number };
  installed: {
    ref: string;
    buildId: string;
    entryPath?: string;
    missing: boolean;
  } | null;
  job: { state: string; reason?: string } | null;
}

interface Inspected {
  pending: string;
  id: string;
  runtime: string;
  verified: boolean;
  type?: string;
  apps?: { id: string; name: string; capabilities: string[] }[];
  manifest: { name: string; capabilities: string[] };
  source: { commit: string };
  current: { commit: string } | null;
}

describe('apps from a URL built from source (e2e)', () => {
  let work: string;
  let prevFilesRoot: string | undefined;
  let repo: string;
  let catalog: string;
  let appsDir: string;
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let cookie: string;
  let notesUrl: string;
  let id: string;

  const commitAll = (message: string) => {
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', message);
    return git(repo, 'rev-parse', 'HEAD');
  };

  /** Write the verified list as the sync script does, naming `apps`. */
  const verify = (apps: { subdir?: string; commit: string }[]) =>
    writeFileSync(
      join(catalog, 'verified.json'),
      JSON.stringify({
        from: 'imbatranim-apps',
        commit: 'f'.repeat(40),
        apps: apps.map((a) => ({ repo: `file://${repo}`, ...a })),
      }),
    );

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'imb-marketplace-native-'));
    prevFilesRoot = process.env.FILES_ROOT;
    process.env.FILES_ROOT = join(work, 'home');
    repo = join(work, 'repo');
    writeApp(join(repo, 'apps', 'notes'), {
      'imbatranim.json': nativeManifest('notes'),
      'build.js': BUILD_JS,
      'version.txt': 'v1',
    });
    writeApp(join(repo, 'apps', 'desk'), {
      'imbatranim.json': JSON.stringify({
        schemaVersion: 2,
        name: 'Desk',
        type: 'static',
        build: { command: ['node', 'build.js', 'tasks'], output: 'dist' },
        apps: [
          {
            id: 'tasks',
            name: 'Tasks',
            entry: 'tasks.mjs',
            capabilities: ['notify'],
          },
        ],
        minSystemVersion: 2,
      }),
      'build.js': BUILD_JS,
      'version.txt': 'desk',
    });
    writeApp(join(repo, 'apps', 'broken'), {
      'imbatranim.json': nativeManifest('broken', {
        build: {
          command: ['node', 'build.js', 'broken', 'fail'],
          entry: 'dist/broken.mjs',
        },
      }),
      'build.js': BUILD_JS,
      'version.txt': 'x',
    });
    writeApp(join(repo, 'apps', 'greedy'), {
      'imbatranim.json': nativeManifest('greedy', { capabilities: ['root'] }),
    });
    writeApp(join(repo, 'apps', 'named'), {
      'imbatranim.json': nativeManifest('named', { id: 'notepad' }),
    });
    writeApp(join(repo, 'apps', 'prebuilt'), {
      'imbatranim.json': JSON.stringify({
        schemaVersion: 1,
        name: 'Prebuilt',
        entry: 'dist/prebuilt.mjs',
        capabilities: ['notify'],
        minSystemVersion: 2,
      }),
    });
    writeApp(join(repo, 'apps', 'prebuilt', 'dist'), {
      'prebuilt.mjs': 'export function mount() {}\n',
    });
    git(repo, 'init', '-q', '-b', 'main');
    commitAll('v1');
    notesUrl = `file://${repo}#main/apps/notes`;
    id = deriveAppId(`file://${repo}`, 'apps/notes');

    catalog = join(work, 'catalog');
    mkdirSync(catalog);
    const values: Record<string, unknown> = {
      DB_PATH: join(work, 'home', '.imbatranim', 'db.sqlite'),
      FRONTEND_URL: 'http://localhost:5173',
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
    await app.init();
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

  const inspect = async (url: string): Promise<Inspected> =>
    (
      await http
        .post('/api/marketplace/url/inspect')
        .set('Cookie', cookie)
        .send({ url })
        .expect(200)
    ).body as Inspected;

  const install = (pending: string, trust?: boolean) =>
    http
      .post('/api/marketplace/url/install')
      .set('Cookie', cookie)
      .send(trust === undefined ? { pending } : { pending, trust });

  const settled = () => app.get(MarketplaceService).settled();

  const listed = async (): Promise<Listed[]> =>
    (
      (await http.get('/api/marketplace').set('Cookie', cookie).expect(200))
        .body as { apps: Listed[] }
    ).apps;

  const builds = (appId: string) =>
    readdirSync(appsDir).filter((n) => n.startsWith(`${appId}@`));

  /** The installed module's text, fetched on the native route. */
  const served = async (entryPath: string) =>
    (await http.get(`/api/${entryPath}`).set('Cookie', cookie).expect(200))
      .text;

  it('checks an app built from source as unverified, listing what it asks for', async () => {
    const checked = await inspect(notesUrl);
    expect(checked).toMatchObject({
      id,
      runtime: 'native',
      verified: false,
      type: 'static',
      apps: [{ id, name: 'Notes', capabilities: ['fs', 'notify'] }],
      manifest: { name: 'Notes', capabilities: ['fs', 'notify'] },
      current: null,
    });
    await http
      .delete(`/api/marketplace/url/pending/${checked.pending}`)
      .set('Cookie', cookie)
      .expect(204);
  });

  it('refuses an unverified app until the owner trusts it, then builds it from the checked clone', async () => {
    const checked = await inspect(notesUrl);
    const refused = await install(checked.pending).expect(403);
    expect((refused.body as { message: string }).message).toBe(
      `Notes is not verified. Installing it at ${checked.source.commit.slice(0, 7)} needs your trust.`,
    );
    await install(checked.pending, false).expect(403);
    // Refused is not used up: the same check can still be trusted.
    const queued = (await install(checked.pending, true).expect(200))
      .body as Listed;
    expect(queued).toMatchObject({ id, runtime: 'native' });
    expect(queued.job).not.toBeNull();
    await settled();
    // Built where it was checked: no second clone.
    expect(builds(id)).toHaveLength(1);
    expect(builds(id)[0]).toMatch(
      new RegExp(`^${id}@${checked.source.commit.slice(0, 12)}-`),
    );

    const notes = (await listed()).find((a) => a.id === id)!;
    expect(notes).toMatchObject({
      descriptorId: id,
      runtime: 'native',
      ref: checked.source.commit,
      capabilities: ['fs', 'notify'],
      source: { commit: checked.source.commit, subdir: 'apps/notes' },
      trust: { by: 'owner', at: expect.any(Number) as number },
      job: null,
    });
    expect(notes.installed?.missing).toBe(false);
    expect(await served(notes.installed!.entryPath!)).toContain('"v1"');
    // It is an installed app to app identity: its own install group.
    expect(installGroupOf(app.get(DbService), id)).toBe(id);
  }, 30_000);

  it('asks again for a new commit: trust is per commit', async () => {
    const before = (await listed()).find((a) => a.id === id)!;
    writeFileSync(join(repo, 'apps', 'notes', 'version.txt'), 'v2');
    const next = commitAll('v2');
    const checked = await inspect(notesUrl);
    expect(checked).toMatchObject({
      verified: false,
      source: { commit: next },
      current: { commit: before.ref },
    });
    await install(checked.pending).expect(403);
    await http
      .delete(`/api/marketplace/url/pending/${checked.pending}`)
      .set('Cookie', cookie)
      .expect(204);
    expect((await listed()).find((a) => a.id === id)?.installed?.ref).toBe(
      before.ref,
    );
  });

  it('installs a verified commit with no trust asked, and records it as verified', async () => {
    const tip = git(repo, 'rev-parse', 'HEAD');
    verify([{ subdir: 'apps/notes', commit: tip }]);
    const checked = await inspect(notesUrl);
    expect(checked.verified).toBe(true);
    await install(checked.pending).expect(200);
    await settled();
    const notes = (await listed()).find((a) => a.id === id)!;
    expect(notes).toMatchObject({
      ref: tip,
      installed: { ref: tip },
      trust: { by: 'verified' },
    });
    expect(await served(notes.installed!.entryPath!)).toContain('"v2"');
    expect(builds(id)).toHaveLength(1);
  }, 30_000);

  it('updates a verified app when the verified list moves, through the install route', async () => {
    const old = git(repo, 'rev-parse', 'HEAD');
    writeFileSync(join(repo, 'apps', 'notes', 'version.txt'), 'v3');
    const next = commitAll('v3');
    expect((await listed()).find((a) => a.id === id)?.ref).toBe(old);
    verify([{ subdir: 'apps/notes', commit: next }]);
    const outdated = (await listed()).find((a) => a.id === id)!;
    expect(outdated.ref).toBe(next);
    expect(outdated.installed?.ref).toBe(old);

    await http
      .post(`/api/marketplace/apps/${id}/install`)
      .set('Cookie', cookie)
      .expect(202);
    await settled();
    const notes = (await listed()).find((a) => a.id === id)!;
    expect(notes.job).toBeNull();
    expect(notes.installed?.ref).toBe(next);
    expect(notes.trust?.by).toBe('verified');
    expect(await served(notes.installed!.entryPath!)).toContain('"v3"');
    verify([]);
  }, 30_000);

  it('rebuilds a trusted app at its own commit, and no other, through the install route', async () => {
    const tip = git(repo, 'rev-parse', 'HEAD');
    const checked = await inspect(`file://${repo}#main/apps/desk`);
    await install(checked.pending, true).expect(200);
    await settled();
    const deskId = deriveAppId(`file://${repo}`, 'apps/desk');
    writeFileSync(join(repo, 'apps', 'desk', 'version.txt'), 'desk 2');
    commitAll('desk 2');
    await http
      .post(`/api/marketplace/apps/${deskId}/install`)
      .set('Cookie', cookie)
      .expect(202);
    await settled();
    const tasks = (await listed()).find((a) => a.descriptorId === deskId)!;
    expect(tasks.installed?.ref).toBe(tip);
    expect(tasks.trust?.by).toBe('owner');
    expect(await served(tasks.installed!.entryPath!)).toContain('"desk"');
  }, 30_000);

  it('names each app of several under the derived id', async () => {
    const deskId = deriveAppId(`file://${repo}`, 'apps/desk');
    const apps = (await listed()).filter((a) => a.descriptorId === deskId);
    expect(apps.map((a) => a.id)).toEqual([`${deskId}-tasks`]);
    expect(installGroupOf(app.get(DbService), `${deskId}-tasks`)).toBe(deskId);
  });

  it('refuses a manifest the catalog schema refuses, or one that names its own id', async () => {
    const greedy = await http
      .post('/api/marketplace/url/inspect')
      .set('Cookie', cookie)
      .send({ url: `file://${repo}#main/apps/greedy` })
      .expect(400);
    expect((greedy.body as { message: string }).message).toMatch(
      /^imbatranim\.json: capabilities\.0: /,
    );
    const named = await http
      .post('/api/marketplace/url/inspect')
      .set('Cookie', cookie)
      .send({ url: `file://${repo}#main/apps/named` })
      .expect(400);
    expect((named.body as { message: string }).message).toBe(
      'imbatranim.json: id: an app from a URL does not set its id: the OS derives it',
    );
  });

  it('lists a failed first build with its job, and Clear forgets it', async () => {
    const brokenId = deriveAppId(`file://${repo}`, 'apps/broken');
    const checked = await inspect(`file://${repo}#main/apps/broken`);
    await install(checked.pending, true).expect(200);
    await settled();
    const broken = (await listed()).find((a) => a.id === brokenId)!;
    expect(broken.installed).toBeNull();
    expect(broken.job?.state).toBe('failed');
    expect(builds(brokenId)).toEqual([]);
    await http
      .delete(`/api/marketplace/apps/${brokenId}`)
      .set('Cookie', cookie)
      .expect(204);
    expect((await listed()).some((a) => a.id === brokenId)).toBe(false);
  }, 30_000);

  it('still installs a prebuilt app sandboxed, with no trust asked', async () => {
    const checked = await inspect(`file://${repo}#main/apps/prebuilt`);
    expect(checked).toMatchObject({ runtime: 'sandboxed', verified: false });
    const installed = (await install(checked.pending).expect(200))
      .body as Listed;
    expect(installed.runtime).toBe('sandboxed');
    expect(installed.trust).toBeUndefined();
  });

  it("reaches the native runtime's routes as a catalog app does", async () => {
    // A static app has no server: refused as a catalog app's would be, not
    // as a sandboxed app's (404).
    await http
      .post(`/api/marketplace/apps/${id}/lease`)
      .set('Cookie', cookie)
      .send({})
      .expect(409);
    await http
      .get(`/api/marketplace/apps/${id}/log`)
      .set('Cookie', cookie)
      .expect(200)
      .expect((res) => expect(res.text).toContain('verified'));
  });

  it('uninstalls a native app: the row and the builds go', async () => {
    await http
      .delete(`/api/marketplace/apps/${id}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(builds(id)).toEqual([]);
    expect((await listed()).some((a) => a.id === id)).toBe(false);
    await http
      .post(`/api/marketplace/apps/${id}/install`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
