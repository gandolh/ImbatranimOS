// Brief 28: opt-in SETUP_TOKEN gate on first-run claim. Both env vars must be
// set before AppModule (and its config validation) is imported. Jest isolates
// each e2e spec's module registry, so this SETUP_TOKEN does not leak into the
// default-off auth.e2e-spec.ts run.
process.env.DB_PATH = ':memory:';
process.env.SETUP_TOKEN = 'operator-out-of-band-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'http';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from './../src/app.module';

const PASSWORD = 'correct-horse-battery-staple';
const SETUP_TOKEN = 'operator-out-of-band-secret';

describe('Auth setup token gate (e2e)', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  it('advertises setupTokenRequired while unclaimed', async () => {
    const res = await http.get('/api/auth/status').expect(200);
    expect(res.body).toEqual({
      needsSetup: true,
      authenticated: false,
      totpEnabled: false,
      setupTokenRequired: true,
    });
  });

  it('rejects setup with no token (401)', async () => {
    await http.post('/api/auth/setup').send({ password: PASSWORD }).expect(401);
  });

  it('rejects setup with a wrong token (401)', async () => {
    await http
      .post('/api/auth/setup')
      .send({ password: PASSWORD, token: 'not-the-secret' })
      .expect(401);
  });

  it('accepts setup with the correct token and issues a session (201)', async () => {
    const res = await http
      .post('/api/auth/setup')
      .send({ password: PASSWORD, token: SETUP_TOKEN })
      .expect(201);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie']);
    expect(setCookie[0]).toContain('imb_session=');
  });

  it('no longer advertises setupTokenRequired once claimed', async () => {
    const res = await http.get('/api/auth/status').expect(200);
    expect(res.body).toMatchObject({
      needsSetup: false,
      setupTokenRequired: false,
    });
  });
});
