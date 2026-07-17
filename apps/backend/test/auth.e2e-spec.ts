// In-memory DB so the e2e never touches a real file. Must be set before the
// AppModule (and its config validation) is imported.
process.env.DB_PATH = ':memory:';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { generateSync } from 'otplib';
import { AppModule } from './../src/app.module';

const PASSWORD = 'correct-horse-battery-staple';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts bootstrap (createNestApplication does not run it).
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts in needs-setup, unauthenticated state', async () => {
    const res = await http.get('/api/auth/status').expect(200);
    expect(res.body).toEqual({
      needsSetup: true,
      authenticated: false,
      totpEnabled: false,
    });
  });

  it('blocks protected routes before setup (401)', async () => {
    await http.get('/api/todos').expect(401);
  });

  it('rejects a weak first-run password (400)', async () => {
    await http.post('/api/auth/setup').send({ password: 'short' }).expect(400);
  });

  let sessionCookie: string;

  it('first-run setup creates the user and issues a session', async () => {
    const res = await http
      .post('/api/auth/setup')
      .send({ password: PASSWORD })
      .expect(201);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    sessionCookie = ([] as string[]).concat(setCookie)[0];
    expect(sessionCookie).toContain('imb_session=');
    expect(sessionCookie.toLowerCase()).toContain('httponly');
  });

  it('a protected route succeeds with the session cookie', async () => {
    await http.get('/api/todos').set('Cookie', sessionCookie).expect(200);
  });

  it('refuses a second setup (409)', async () => {
    await http.post('/api/auth/setup').send({ password: PASSWORD }).expect(409);
  });

  it('logout clears the session', async () => {
    await http
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie)
      .expect(200);
    await http.get('/api/todos').set('Cookie', sessionCookie).expect(401);
  });

  it('login rejects a wrong password (401) and accepts the right one', async () => {
    await http
      .post('/api/auth/login')
      .send({ password: 'wrong-password-xx' })
      .expect(401);
    const res = await http
      .post('/api/auth/login')
      .send({ password: PASSWORD })
      .expect(200);
    sessionCookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
  });

  it('enforces TOTP once enabled', async () => {
    // Enroll + confirm TOTP (authenticated).
    const enroll = await http
      .post('/api/auth/totp/enroll')
      .set('Cookie', sessionCookie)
      .expect(200);
    const secret: string = enroll.body.secret;
    await http
      .post('/api/auth/totp/enable')
      .set('Cookie', sessionCookie)
      .send({ token: generateSync({ secret }) })
      .expect(200);

    const status = await http.get('/api/auth/status').expect(200);
    expect(status.body.totpEnabled).toBe(true);

    // Password alone no longer logs in.
    await http.post('/api/auth/login').send({ password: PASSWORD }).expect(401);
    // Password + valid TOTP does.
    await http
      .post('/api/auth/login')
      .send({ password: PASSWORD, token: generateSync({ secret }) })
      .expect(200);
  });

  it('rate-limits repeated failed logins (eventually 429)', async () => {
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await http
        .post('/api/auth/login')
        .send({ password: 'nope-nope-nope' });
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
