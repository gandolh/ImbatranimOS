import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { LocalIdentityController } from '../local-identity/local-identity.controller';
import { LocalIdentityService } from '../local-identity/local-identity.service';
import { SessionGuard } from './identity.guard';
import { MeController } from './me.controller';

/**
 * Identity: the machine's own single-owner sign-in, the only one since
 * brief 157.
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
 */
@Global()
@Module({
  controllers: [MeController, LocalIdentityController],
  providers: [
    LocalIdentityService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [LocalIdentityService],
})
export class IdentityModule {}
