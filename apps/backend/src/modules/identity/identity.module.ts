import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AppIdentityGuard } from '../app-identity/app-identity.guard';
import { AppTokens } from '../app-identity/app-tokens';
import { LocalIdentityController } from '../local-identity/local-identity.controller';
import { LocalIdentityService } from '../local-identity/local-identity.service';
import { SessionGuard } from './identity.guard';
import { MeController } from './me.controller';

/**
 * Identity: the machine's own single-owner sign-in, the only one since
 * the move off Ward.
 *
 * Registers the global {@link SessionGuard} so every route is authenticated by
 * default, and exports {@link LocalIdentityService} so a WebSocket upgrade
 * validates through the same `authenticate` the REST guard uses. Two
 * definitions of "is this a valid session" is how a WS endpoint ends up
 * honouring a session REST has already refused.
 *
 * `@Global` because the guard is global: a module that did not import this
 * one would still be guarded by it, and would then have no way to inject the
 * service for its own WS upgrade.
 *
 * {@link AppIdentityGuard} (which app is calling) is registered here, after
 * `SessionGuard` in the same list: Nest runs global guards in the order they
 * are registered, and an app token only resolves under its session.
 */
@Global()
@Module({
  controllers: [MeController, LocalIdentityController],
  providers: [
    LocalIdentityService,
    AppTokens,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: AppIdentityGuard },
  ],
  exports: [LocalIdentityService, AppTokens],
})
export class IdentityModule {}
