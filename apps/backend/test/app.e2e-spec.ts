// In-memory DB so the e2e never touches a real file.
process.env.DB_PATH = ':memory:';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Smoke test: the app boots and its global auth guard is wired — an
  // unauthenticated API call is rejected. (Detailed auth flow: auth.e2e-spec.)
  it('rejects an unauthenticated API request (401)', () => {
    return request(app.getHttpServer()).get('/api/todos').expect(401);
  });
});
