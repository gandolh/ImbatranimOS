// In-memory DB so this e2e never touches real data.
process.env.DB_PATH = ':memory:';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'fs';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { ConfigModule } from '../src/config/config.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { AppDataModule } from '../src/modules/app-data/app-data.module';
import { DATA_NEEDS_APP } from '../src/modules/app-data/app-data.controller';
import { AppIdentityModule } from '../src/modules/app-identity/app-identity.module';
import { APP_TOKEN_HEADER } from '../src/modules/app-identity/app-identity.types';
import { ModeStore } from '../src/modules/app-identity/mode-store.service';
import {
  IdentityTestModule,
  TEST_COOKIE,
} from '../src/modules/identity/testing';

const mint = () => randomBytes(32).toString('hex');

describe('App data folders (e2e)', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let home: string;
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'imb-data-e2e-'));
    process.env.FILES_ROOT = home;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        DbModule,
        IdentityTestModule,
        AppIdentityModule,
        AppDataModule,
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());
    // Hollow is in the catalog, so it acts only while installed.
    app
      .get(DbService)
      .db.prepare(
        `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at)
           VALUES ('hollow', 'abc', 'b1', '/x', 'dist/hollow.js', 1)`,
      )
      .run();
  });

  afterEach(async () => {
    await app.close();
    process.env.FILES_ROOT = prevRoot;
    rmSync(home, { recursive: true, force: true });
  });

  /** Register a token for a running copy of `appId`, as core does. */
  async function start(
    appId: string,
    instanceId = `${appId}-1`,
  ): Promise<string> {
    const token = mint();
    await http
      .post('/api/system/app-tokens')
      .set('Cookie', TEST_COOKIE)
      .send({ token, appId, instanceId, windowId: null })
      .expect(201);
    return token;
  }

  const as = (token: string | null) => {
    const withToken = (req: request.Test) =>
      token ? req.set(APP_TOKEN_HEADER, token) : req;
    return {
      read: (kind: string, path: string) =>
        withToken(
          http
            .get(`/api/system/data/${kind}/file`)
            .query({ path })
            .set('Cookie', TEST_COOKIE),
        ),
      write: (kind: string, body: Record<string, unknown>) =>
        withToken(
          http
            .put(`/api/system/data/${kind}/file`)
            .set('Cookie', TEST_COOKIE)
            .send(body),
        ),
      list: (kind: string, path = '') =>
        withToken(
          http
            .get(`/api/system/data/${kind}/list`)
            .query({ path })
            .set('Cookie', TEST_COOKIE),
        ),
      remove: (kind: string, path: string, expected?: string) =>
        withToken(
          http
            .delete(`/api/system/data/${kind}/file`)
            .query(expected === undefined ? { path } : { path, expected })
            .set('Cookie', TEST_COOKIE),
        ),
    };
  };

  const body = (res: request.Response) => res.body as Record<string, unknown>;

  it('needs a session, then an app: the user has no data folder', async () => {
    await http.get('/api/system/data/data/list').expect(401);
    const res = await as(null).list('data').expect(403);
    expect(body(res).code).toBe(DATA_NEEDS_APP);
  });

  it('writes, reads, lists and removes in the app’s own folder', async () => {
    const hollow = as(await start('hollow'));
    await hollow.read('data', 'save.json').expect(404);

    const written = await hollow
      .write('data', {
        path: 'save.json',
        content: '{"level":1}',
        expected: null,
      })
      .expect(200);
    const version = body(written).version as string;
    expect(body(written).path).toBe('save.json');
    expect(
      readFileSync(
        join(home, '.local/share/imbatranim/hollow/save.json'),
        'utf8',
      ),
    ).toBe('{"level":1}');

    const read = await hollow.read('data', 'save.json').expect(200);
    expect(read.body).toEqual({
      path: 'save.json',
      content: '{"level":1}',
      version,
    });
    const list = await hollow.list('data').expect(200);
    expect((list.body as { name: string }[]).map((e) => e.name)).toEqual([
      'save.json',
    ]);

    await hollow.remove('data', 'save.json').expect(204);
    await hollow.remove('data', 'save.json').expect(204);
    await hollow.read('data', 'save.json').expect(404);
  });

  it('records what an app makes as its own, private', async () => {
    const hollow = as(await start('hollow'));
    await hollow
      .write('state', { path: 'recent.json', content: '[]' })
      .expect(200);
    const modes = app.get(ModeStore);
    expect(modes.stat(join(home, '.local/state/imbatranim/hollow'))).toEqual({
      owner: 'hollow',
      group: 'hollow',
      mode: 0o700,
    });
    expect(
      modes.stat(join(home, '.local/state/imbatranim/hollow/recent.json')),
    ).toEqual({ owner: 'hollow', group: 'hollow', mode: 0o600 });
  });

  it('takes the kind from the route, and refuses one it doesn’t know', async () => {
    const hollow = as(await start('hollow'));
    await hollow
      .write('cache', { path: 'thumbs.json', content: '1' })
      .expect(200);
    readFileSync(join(home, '.cache/imbatranim/hollow/thumbs.json'));
    await hollow.read('data', 'thumbs.json').expect(404);
    await hollow.write('secrets', { path: 'a', content: '1' }).expect(400);
    await hollow.read('..', 'a').expect(404);
  });

  it('keeps every path inside the folder', async () => {
    const hollow = as(await start('hollow'));
    const other = as(await start('other'));
    await other
      .write('data', { path: 'mine.json', content: 'other’s' })
      .expect(200);

    await hollow.read('data', '../other/mine.json').expect(400);
    await hollow
      .write('data', { path: '../other/mine.json', content: 'taken' })
      .expect(400);
    await hollow.read('data', 'mine.json').expect(404);
    await hollow.list('data', '..').expect(400);

    symlinkSync('/etc', join(home, '.local/share/imbatranim/other/etc'));
    await other.read('data', 'etc/hostname').expect(400);
    await other.list('data', 'etc').expect(400);
  });

  it('refuses a stale write with a 409 the app can show, carrying the current version', async () => {
    const tabOne = as(await start('hollow', 'tab-1'));
    const tabTwo = as(await start('hollow', 'tab-2'));
    const first = await tabOne
      .write('data', { path: 'c.json', content: 'v1', expected: null })
      .expect(200);
    const v1 = body(first).version;

    const saved = await tabTwo
      .write('data', {
        path: 'c.json',
        content: 'v2 from tab two',
        expected: v1,
      })
      .expect(200);
    const refused = await tabOne
      .write('data', {
        path: 'c.json',
        content: 'v2 from tab one',
        expected: v1,
      })
      .expect(409);
    expect(body(refused).current).toBe(body(saved).version);
    expect(typeof body(refused).message).toBe('string');

    const fresh = await tabOne
      .write('data', { path: 'c.json', content: 'again', expected: null })
      .expect(409);
    expect(body(fresh).current).toBe(body(saved).version);
  });

  it('removes only the version a tab read, refusing one saved since', async () => {
    const tabOne = as(await start('hollow', 'tab-1'));
    const tabTwo = as(await start('hollow', 'tab-2'));
    const v1 = body(
      await tabOne.write('data', { path: 'd.json', content: '1' }).expect(200),
    ).version as string;
    const saved = await tabTwo
      .write('data', { path: 'd.json', content: '2', expected: v1 })
      .expect(200);
    const refused = await tabOne.remove('data', 'd.json', v1).expect(409);
    expect(body(refused).current).toBe(body(saved).version);
    await tabOne
      .remove('data', 'd.json', body(saved).version as string)
      .expect(204);
    await tabOne.read('data', 'd.json').expect(404);
  });

  it('validates the body', async () => {
    const hollow = as(await start('hollow'));
    await hollow.write('data', { path: 'a', content: 42 }).expect(400);
    await hollow
      .write('data', { path: 'a', content: 'x', expected: 7 })
      .expect(400);
    await hollow.write('data', { content: 'x' }).expect(400);
  });
});
