import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';

import { DbModule } from '../src/db/db.module';
import { WardModule } from '../src/modules/ward/ward.module';

/**
 * The local single-owner sign-in, end to end (brief 152, option C): what a
 * standalone run, a friend's Docker install and the server ISO use when no
 * WARD_* variable is set. Through the real guard, `/api/me` and the cookie.
 *
 * `ConfigModule` validates `process.env` when it is imported, and the test
 * setup fills in fictional WARD_* values for every other suite, so this one
 * supplies its own `ConfigService` holding exactly the variables it means.
 */
async function boot(
  env: Record<string, string>,
): Promise<INestApplication<Server>> {
  const values: Record<string, string> = { DB_PATH: ':memory:', ...env };

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
    imports: [TestConfig, DbModule, WardModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

const PASSWORD = 'correct horse battery';

interface IdentityBody {
  mode: string;
  local?: { setUp: boolean; setupTokenRequired: boolean };
}
const identity = async (http: ReturnType<typeof request>) =>
  (await http.get('/api/identity')).body as IdentityBody;
const sessionCookie = (res: request.Response) =>
  [res.headers['set-cookie']].flat().find((c) => c?.startsWith('imb_session='));

describe('the local sign-in (e2e) — brief 152', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;

  beforeEach(async () => {
    app = await boot({});
    http = request(app.getHttpServer());
  });
  afterEach(async () => {
    await app.close();
  });

  it('says it is in local mode, unclaimed, and nobody is signed in', async () => {
    const res = await http.get('/api/identity').expect(200);
    expect(res.body).toEqual({
      mode: 'local',
      local: { setUp: false, setupTokenRequired: false },
    });
    await http.get('/api/me').expect(401);
  });

  it('is claimed once, then signs the owner in with an httpOnly cookie the guard accepts', async () => {
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: 'short' })
      .expect(400);
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Mallory', password: 'another long one' })
      .expect(409);
    expect((await identity(http)).local!.setUp).toBe(true);

    await http
      .post('/api/identity/local/sign-in')
      .send({ password: 'not the password' })
      .expect(401);
    const signedIn = await http
      .post('/api/identity/local/sign-in')
      .send({ password: PASSWORD })
      .expect(204);
    const cookie = sessionCookie(signedIn);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await http
      .get('/api/me')
      .set('Cookie', cookie!.split(';')[0])
      .expect(200);
    expect(me.body).toEqual({
      user: { subject: 'local-owner', username: 'Ana' },
    });
  });

  it('marks the cookie Secure when a TLS proxy says the browser used HTTPS', async () => {
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    const plain = await http
      .post('/api/identity/local/sign-in')
      .send({ password: PASSWORD });
    expect(sessionCookie(plain)).not.toMatch(/Secure/i);
    const proxied = await http
      .post('/api/identity/local/sign-in')
      .set('X-Forwarded-Proto', 'https')
      .send({ password: PASSWORD });
    expect(sessionCookie(proxied)).toMatch(/Secure/i);
  });

  it('signing out ends the session', async () => {
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    const cookie = sessionCookie(
      await http
        .post('/api/identity/local/sign-in')
        .send({ password: PASSWORD }),
    )!.split(';')[0];
    await http
      .post('/api/identity/local/sign-out')
      .set('Cookie', cookie)
      .expect(204);
    await http.get('/api/me').set('Cookie', cookie).expect(401);
  });

  it('slows down a guesser: after five misses the next is 429 with Retry-After', async () => {
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    for (let i = 0; i < 5; i++) {
      await http
        .post('/api/identity/local/sign-in')
        .send({ password: `guess ${i}` })
        .expect(401);
    }
    await http
      .post('/api/identity/local/sign-in')
      .send({ password: 'guess 5' })
      .expect(401);
    const blocked = await http
      .post('/api/identity/local/sign-in')
      .send({ password: PASSWORD })
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('changing the password keeps this session and ends the others', async () => {
    await http
      .post('/api/identity/local/setup')
      .send({ username: 'Ana', password: PASSWORD })
      .expect(204);
    const signIn = async () =>
      sessionCookie(
        await http
          .post('/api/identity/local/sign-in')
          .send({ password: PASSWORD }),
      )!.split(';')[0];
    const laptop = await signIn();
    const phone = await signIn();
    await http
      .post('/api/identity/local/password')
      .set('Cookie', laptop)
      .send({ current: PASSWORD, next: 'a brand new passphrase' })
      .expect(204);
    await http.get('/api/me').set('Cookie', laptop).expect(200);
    await http.get('/api/me').set('Cookie', phone).expect(401);
    await http
      .post('/api/identity/local/sign-in')
      .send({ password: PASSWORD })
      .expect(401);
  });
});

describe('the local sign-in with a SETUP_TOKEN (e2e)', () => {
  it('needs the operator token to claim the machine', async () => {
    const app = await boot({ SETUP_TOKEN: 'printed-on-the-console' });
    const http = request(app.getHttpServer());
    try {
      expect((await identity(http)).local!.setupTokenRequired).toBe(true);
      await http
        .post('/api/identity/local/setup')
        .send({ username: 'Ana', password: PASSWORD })
        .expect(400);
      await http
        .post('/api/identity/local/setup')
        .send({ username: 'Ana', password: PASSWORD, setupToken: 'a guess' })
        .expect(400);
      await http
        .post('/api/identity/local/setup')
        .send({
          username: 'Ana',
          password: PASSWORD,
          setupToken: 'printed-on-the-console',
        })
        .expect(204);
      expect((await identity(http)).local!).toEqual({
        setUp: true,
        setupTokenRequired: false,
      });
    } finally {
      await app.close();
    }
  });
});

describe('a Ward install exposes no local sign-in (e2e)', () => {
  it('reports Ward mode, and every local route is 404', async () => {
    const app = await boot({
      WARD_PUBLIC_ORIGIN: 'https://ward.test',
      WARD_API_BASE_PATH: '/ward-api',
      WARD_APP_KEY: 'wak_test_key_not_a_real_credential',
    });
    const http = request(app.getHttpServer());
    try {
      expect(await identity(http)).toEqual({ mode: 'ward' });
      await http
        .post('/api/identity/local/setup')
        .send({ username: 'Ana', password: PASSWORD })
        .expect(404);
      await http
        .post('/api/identity/local/sign-in')
        .send({ password: PASSWORD })
        .expect(404);
    } finally {
      await app.close();
    }
  });
});
