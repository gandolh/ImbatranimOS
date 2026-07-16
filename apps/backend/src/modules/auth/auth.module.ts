import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { ThrottleService } from './throttle.service';
import { SessionAuthGuard } from './auth.guard';

/**
 * Auth (Brief 10). Registers the global {@link SessionAuthGuard} so every
 * route is authenticated by default. SessionService is exported so future
 * modules (terminal/files WebSocket gateways) can validate upgrade requests.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    ThrottleService,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
  exports: [SessionService, AuthService],
})
export class AuthModule {}
