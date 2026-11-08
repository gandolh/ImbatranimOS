// In-memory DB so this e2e never touches real data.
process.env.DB_PATH = ':memory:';

import {
  Body,
  Controller,
  Get,
  Global,
  INestApplication,
  Module,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import type { Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { ConfigModule } from '../src/config/config.module';
import { DbModule } from '../src/db/db.module';
import { DbService } from '../src/db/db.service';
import { AppIdentityModule } from '../src/modules/app-identity/app-identity.module';
import {
  APP_TOKEN_HEADER,
  APP_TOKEN_REFUSED,
  type AppIdentity,
} from '../src/modules/app-identity/app-identity.types';
import { CallingApp } from '../src/modules/app-identity/calling-app';
import {
  MODE_REFUSED,
  ModeStore,
} from '../src/modules/app-identity/mode-store.service';
import type { EntryKind } from '../src/modules/app-identity/modes';
import { IdentityModule } from '../src/modules/identity/identity.module';
import {
  FakeIdentityService,
  IdentityTestModule,
  TEST_COOKIE,
} from '../src/modules/identity/testing';
import {
  LOCAL_SESSION_COOKIE,
  LocalIdentityService,
} from '../src/modules/local-identity/local-identity.service';

const HOME = '/home/imbatranim';
const SUITE = `${HOME}/.local/share/imbatranim/imbatranim-office`;

/**
 * A route that takes an identity, standing in for the file routes that will
 * (an app's data folder, and files by grant): it checks the mode, then acts.
 */
@Controller('mode-probe')
class ModeProbeController {
  constructor(private readonly store: ModeStore) {}

  @Get('read')
  read(@CallingApp() app: AppIdentity | null, @Query('path') path: string) {
    this.store.assert(app, 'read', path);
    return { read: path };
  }

  @Post('create')
  create(
    @CallingApp() app: AppIdentity | null,
    @Body() body: { path: string; kind: EntryKind; mode?: number },
  ) {
    this.store.assert(app, 'create', body.path);
    return this.store.create(app, body.path, body.kind, body.mode);
  }
}

@Module({ imports: [AppIdentityModule], controllers: [ModeProbeController] })
class ModeProbeModule {}

const mint = () => randomBytes(32).toString('hex');

/** The parts of a response body these tests read. */
const codeOf = (res: request.Response) => (res.body as { code?: string }).code;
const appOf = (res: request.Response) =>
  (res.body as { app: AppIdentity | null }).app;

describe('App identity (e2e)', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        DbModule,
        IdentityTestModule,
        AppIdentityModule,
        ModeProbeModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());

    // Office is installed: one descriptor, two apps. Hollow is a single-app one.
    const install = app.get(DbService).db.prepare(
      `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, entries, installed_at)
         VALUES (?, 'abc', 'b1', '/x', ?, ?, 1)`,
    );
    install.run(
      'imbatranim-office',
      'dist',
      JSON.stringify({
        'office-docs': 'docs/index.js',
        'office-sheets': 'sheets/index.js',
      }),
    );
    install.run('hollow', 'dist/hollow.js', null);
  });

  afterEach(async () => {
    await app.close();
  });

  /** Register a token for a running copy, as core does, and hand it back. */
  async function start(
    appId: string,
    instanceId = `${appId}-1`,
    cookie = TEST_COOKIE,
  ): Promise<string> {
    const token = mint();
    await http
      .post('/api/system/app-tokens')
      .set('Cookie', cookie)
      .send({ token, appId, instanceId, windowId: instanceId })
      .expect(201);
    return token;
  }

  const whoami = (token?: string, cookie = TEST_COOKIE) => {
    const req = http.get('/api/system/app-tokens/self').set('Cookie', cookie);
    return token ? req.set(APP_TOKEN_HEADER, token) : req;
  };

  describe('tokens', () => {
    it('a call with no session is refused before any token is looked at', async () => {
      await http.get('/api/system/app-tokens/self').expect(401);
      const token = await start('notepad');
      await http
        .get('/api/system/app-tokens/self')
        .set(APP_TOKEN_HEADER, token)
        .expect(401);
    });

    it('a call with no token is the user’s', async () => {
      const res = await whoami().expect(200);
      expect(res.body).toEqual({ app: null });
    });

    it('a token maps to its app and running copy', async () => {
      const token = await start('notepad', 'win-a');
      const res = await whoami(token).expect(200);
      expect(res.body).toEqual({
        app: {
          appId: 'notepad',
          instanceId: 'win-a',
          windowId: 'win-a',
          groups: ['notepad', 'system'],
        },
      });
    });

    it('an installed app’s second group is its descriptor’s id', async () => {
      const docs = await start('office-docs');
      expect(appOf(await whoami(docs))?.groups).toEqual([
        'office-docs',
        'imbatranim-office',
      ]);
      const hollow = await start('hollow');
      expect(appOf(await whoami(hollow))?.groups).toEqual(['hollow']);
    });

    it('a catalog app that isn’t installed gets no identity, nor one of an installed suite’s other apps', async () => {
      // Office is installed with Docs and Sheets only; Slides is in the catalog too.
      for (const appId of ['office-slides', 'minesweeper']) {
        const res = await http
          .post('/api/system/app-tokens')
          .set('Cookie', TEST_COOKIE)
          .send({ token: mint(), appId, instanceId: `${appId}-1` })
          .expect(403);
        expect(JSON.stringify(res.body)).toContain(`${appId} is not installed`);
      }
      // An app no catalog names is a built-in, as before.
      expect(appOf(await whoami(await start('notepad')))?.groups).toEqual([
        'notepad',
        'system',
      ]);
    });

    it('a token dies with its copy', async () => {
      const token = await start('notepad');
      await http
        .delete('/api/system/app-tokens/self')
        .set('Cookie', TEST_COOKIE)
        .set(APP_TOKEN_HEADER, token)
        .expect(204);
      const res = await whoami(token).expect(403);
      expect(codeOf(res)).toBe(APP_TOKEN_REFUSED);
    });

    it('a forged token is refused with a 403 core can tell apart, never a 401', async () => {
      const res = await whoami(mint()).expect(403);
      expect(codeOf(res)).toBe(APP_TOKEN_REFUSED);
      await whoami('nonsense').expect(403);
    });

    it('a token works only under the session it was minted in', async () => {
      const fake = app.get<LocalIdentityService, FakeIdentityService>(
        LocalIdentityService,
      );
      fake.signInAs('second', 'subject_test');
      const other = `${LOCAL_SESSION_COOKIE}=second`;
      const token = await start('notepad');
      const res = await whoami(token, other).expect(403);
      expect(codeOf(res)).toBe(APP_TOKEN_REFUSED);
      // …and once its session has signed out, nothing it held answers.
      fake.forget();
      await whoami(token).expect(401);
    });

    it('a new token for the same copy replaces the old one', async () => {
      const first = await start('notepad', 'win-a');
      const second = await start('notepad', 'win-a');
      await whoami(first).expect(403);
      await whoami(second).expect(200);
    });

    it('an app cannot start an identity', async () => {
      const token = await start('notepad');
      await http
        .post('/api/system/app-tokens')
        .set('Cookie', TEST_COOKIE)
        .set(APP_TOKEN_HEADER, token)
        .send({ token: mint(), appId: 'office-docs', instanceId: 'x' })
        .expect(403);
    });

    it('refuses a malformed registration, a reused token and the group name', async () => {
      const register = (body: Record<string, unknown>) =>
        http
          .post('/api/system/app-tokens')
          .set('Cookie', TEST_COOKIE)
          .send(body);
      await register({
        token: 'short',
        appId: 'notepad',
        instanceId: 'a',
      }).expect(400);
      await register({
        token: mint(),
        appId: 'Not An Id',
        instanceId: 'a',
      }).expect(400);
      await register({
        token: mint(),
        appId: 'notepad',
        instanceId: 'a b',
      }).expect(400);
      await register({
        token: mint(),
        appId: 'system',
        instanceId: 'a',
      }).expect(400);
      const token = mint();
      await register({ token, appId: 'notepad', instanceId: 'a' }).expect(201);
      await register({ token, appId: 'paint', instanceId: 'b' }).expect(409);
    });

    it('a revoke without a token is refused', async () => {
      await http
        .delete('/api/system/app-tokens/self')
        .set('Cookie', TEST_COOKIE)
        .expect(400);
    });
  });

  describe('modes on a route that takes an identity', () => {
    const read = (path: string, token?: string) => {
      const req = http
        .get('/api/mode-probe/read')
        .query({ path })
        .set('Cookie', TEST_COOKIE);
      return token ? req.set(APP_TOKEN_HEADER, token) : req;
    };

    it('a suite shares its setgid folder; anyone else is refused', async () => {
      app.get(ModeStore).set(SUITE, {
        owner: null,
        group: 'imbatranim-office',
        mode: 0o2770,
      });
      const docs = await start('office-docs');
      const sheets = await start('office-sheets');
      const hollow = await start('hollow');

      const made = await http
        .post('/api/mode-probe/create')
        .set('Cookie', TEST_COOKIE)
        .set(APP_TOKEN_HEADER, docs)
        .send({ path: `${SUITE}/plan.json`, kind: 'file', mode: 0o660 })
        .expect(201);
      expect(made.body).toEqual({
        owner: 'office-docs',
        group: 'imbatranim-office',
        mode: 0o660,
      });

      await read(`${SUITE}/plan.json`, sheets).expect(200);
      const refused = await read(`${SUITE}/plan.json`, hollow).expect(403);
      expect(codeOf(refused)).toBe(MODE_REFUSED);
      await http
        .post('/api/mode-probe/create')
        .set('Cookie', TEST_COOKIE)
        .set(APP_TOKEN_HEADER, hollow)
        .send({ path: `${SUITE}/mine.json`, kind: 'file' })
        .expect(403);
      // The user reads everything.
      await read(`${SUITE}/plan.json`).expect(200);
    });

    it('a built-in reaches the user’s files; an installed app does not', async () => {
      await read(`${HOME}/todo.txt`, await start('notepad')).expect(200);
      await read(`${HOME}/todo.txt`, await start('hollow')).expect(403);
      await read(`${HOME}/todo.txt`).expect(200);
    });
  });
});

/**
 * The same, through the real sign-in and `IdentityModule`'s own wiring: the
 * guard that resolves app tokens must run after the one that reads the
 * session, in the module the desktop boots.
 */
describe('App identity through the real sign-in (e2e)', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;

  beforeEach(async () => {
    // No catalog: every app here is a built-in.
    const values: Record<string, unknown> = {
      DB_PATH: ':memory:',
      MARKETPLACE_DIR: join(tmpdir(), 'imb-no-catalog'),
      MARKETPLACE_ALLOW_LOCAL_REPOS: false,
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
      imports: [TestConfig, DbModule, IdentityModule, AppIdentityModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it('resolves a token under the session, refuses a forged one, and ends both on sign-out', async () => {
    const password = 'correct horse battery';
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password })
      .expect(204);
    const signedIn = await http
      .post('/api/identity/local/sign-in')
      .send({ password })
      .expect(204);
    const cookie = [signedIn.headers['set-cookie']]
      .flat()
      .find((c) => c?.startsWith(`${LOCAL_SESSION_COOKIE}=`))!
      .split(';')[0];

    const token = mint();
    await http
      .post('/api/system/app-tokens')
      .set('Cookie', cookie)
      .send({ token, appId: 'notepad', instanceId: 'win-a' })
      .expect(201);

    const self = await http
      .get('/api/system/app-tokens/self')
      .set('Cookie', cookie)
      .set(APP_TOKEN_HEADER, token)
      .expect(200);
    expect(appOf(self)).toMatchObject({
      appId: 'notepad',
      instanceId: 'win-a',
      windowId: null,
    });
    const forged = await http
      .get('/api/system/app-tokens/self')
      .set('Cookie', cookie)
      .set(APP_TOKEN_HEADER, mint())
      .expect(403);
    expect(codeOf(forged)).toBe(APP_TOKEN_REFUSED);

    await http
      .post('/api/identity/local/sign-out')
      .set('Cookie', cookie)
      .expect(204);
    await http
      .get('/api/system/app-tokens/self')
      .set('Cookie', cookie)
      .set(APP_TOKEN_HEADER, token)
      .expect(401);
  });
});
