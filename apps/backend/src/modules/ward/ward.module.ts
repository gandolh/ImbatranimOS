import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { WardAuthGuard } from './ward.guard';
import { WardService } from './ward.service';

/**
 * Ward — the estate's identity service, as this app consumes it.
 *
 * Registers the global {@link WardAuthGuard} so every route is authenticated by
 * default, and exports {@link WardService} so a WebSocket gateway can validate
 * an upgrade through the **same** client the REST guard uses. Two definitions
 * of "is this a valid session" is how a WS endpoint ends up honouring a session
 * REST has already refused.
 *
 * `@Global` because the guard is global: a module that did not import this one
 * would still be guarded by it, and would then have no way to inject
 * `WardService` for its own WS upgrade. The old `AuthModule` avoided this by
 * being explicitly imported everywhere it was needed; making it global is
 * simpler and matches what a process-wide identity actually is.
 */
@Global()
@Module({
  providers: [WardService, { provide: APP_GUARD, useClass: WardAuthGuard }],
  exports: [WardService],
})
export class WardModule {}
