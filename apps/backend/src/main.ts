import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('FRONTEND_URL') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Health check outside global prefix
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (data: unknown) => void }) => {
    res.json({ status: 'ok' });
  });

  await app.listen(config.get('PORT'));
}
bootstrap();
