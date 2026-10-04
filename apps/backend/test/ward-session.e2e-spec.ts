// In-memory DB so this e2e never touches a real file. Must be set before the
// config module (and its validation) is imported.
process.env.DB_PATH = ':memory:';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { ConfigModule } from '../src/config/config.module';
import { WardModule } from '../src/modules/ward/ward.module';
import { DbModule } from '../src/db/db.module';
import { WardService } from '../src/modules/ward/ward.service';
import { WardFreshness } from '../src/modules/ward/ward-freshness';
import { FakeWardService, TEST_COOKIE } from '../src/modules/ward/testing';
import { WardUnavailableError } from '../src/modules/ward/ward.types';

/**
 * `GET /api/me` through the real guard and a fake Ward client (brief 137).
 *
 * `WardModule` itself rather than `WardTestModule`, because `MeController` is
 * registered there; only `WardService` is swapped, so the grant check, the
 * Origin check and the 401/403/503 split are the production ones. The four
 * outcomes are the frontend's whole session model.
 */
describe('GET /api/me (e2e) — brief 137', () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let ward: FakeWardService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, DbModule, WardModule],
    })
      .overrideProvider(WardService)
      .useClass(FakeWardService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());
    ward = moduleFixture.get<FakeWardService>(WardService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers the subject and username for a granted session, and never the grants', async () => {
    const res = await http
      .get('/api/me')
      .set('Cookie', TEST_COOKIE)
      .expect(200);
    expect(res.body).toEqual({
      user: { subject: 'subject_test', username: 'subject_test' },
    });
  });

  it('records the cookie for the terminal sweep only when it passes (brief 145)', async () => {
    const freshness = app.get(WardFreshness);
    ward.signIn('no-grant', 'subject_nogrant', { atrium: ['admin'] });
    await http
      .get('/api/me')
      .set('Cookie', 'ward_session=no-grant')
      .expect(403);
    expect(freshness.size).toBe(0);

    await http.get('/api/me').set('Cookie', TEST_COOKIE).expect(200);
    expect(freshness.size).toBe(1);
  });

  it('is 401 with no session', async () => {
    await http.get('/api/me').expect(401);
  });

  // Ward's integrating.md: "Every integration owes a test that asserts exactly this."
  it('is 403 for a live session holding no grant for this app', async () => {
    ward.signIn('no-grant', 'subject_nogrant', { atrium: ['admin'] });
    await http
      .get('/api/me')
      .set('Cookie', 'ward_session=no-grant')
      .expect(403);
  });

  it('is 503 when Ward is not answering, never 401', async () => {
    ward.breakWith(new WardUnavailableError('connection refused'));
    await http.get('/api/me').set('Cookie', TEST_COOKIE).expect(503);
  });
});
