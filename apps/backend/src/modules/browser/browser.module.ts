import { Module } from '@nestjs/common';

import { BrowserController } from './browser.controller';
import { BrowserProfileService } from './browser-profile.service';
import { BrowserProxyServer } from './browser-proxy.server';

/**
 * The Browser (brief 50): the proxy origin's listener and Wisp relay, and the
 * encrypted profile. `LocalIdentityService` comes from the global
 * IdentityModule, `DbService` from the global DbModule.
 */
@Module({
  controllers: [BrowserController],
  providers: [BrowserProxyServer, BrowserProfileService],
})
export class BrowserModule {}
