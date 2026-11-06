import { Module } from '@nestjs/common';

import { AppTokensController } from './app-tokens.controller';
import { FileGrants } from './file-grants.service';
import { ModeStore } from './mode-store.service';

/**
 * App identity: the routes core registers and ends app tokens on, the store
 * of Unix modes for the apps' data area, and the store of what each running
 * copy was given ({@link FileGrants}).
 *
 * The token map (`AppTokens`) and its guard (`AppIdentityGuard`) are
 * registered by `IdentityModule`, right after `SessionGuard` in the same
 * list, because the guard must run once the session is known and Nest runs
 * global guards in the order they are registered. A module whose routes take
 * an identity imports this one for {@link ModeStore} and reads the caller with
 * `@CallingApp()`.
 */
@Module({
  controllers: [AppTokensController],
  providers: [ModeStore, FileGrants],
  exports: [ModeStore, FileGrants],
})
export class AppIdentityModule {}
