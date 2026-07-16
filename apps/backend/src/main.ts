import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { securityHeaders } from './security-headers';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Behind a TLS-terminating reverse proxy, trust X-Forwarded-* so req.ip
  // (rate-limit key) and the secure-cookie decision reflect the real client.
  if (config.get('TRUST_PROXY')) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(securityHeaders);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  // credentials:true is required for the session cookie to flow cross-origin
  // in dev (Vite 5173 -> API 3001). In prod everything is same-origin.
  app.enableCors({ origin: config.get('FRONTEND_URL'), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Health check outside global prefix
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (data: unknown) => void }) => {
    res.json({ status: 'ok' });
  });

  await app.listen(config.get('PORT'));
}
bootstrap();
