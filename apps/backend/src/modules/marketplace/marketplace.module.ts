import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controller';
import { MarketplaceServers } from './marketplace-servers.service';
import { MarketplaceUrlApps } from './marketplace-url.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceWsProxy } from './marketplace-ws.proxy';
import { PendingInspections } from './pending-inspections';
import { SandboxTokens } from './sandbox-tokens';

/**
 * The app marketplace (brief 120): installs the apps `marketplace/*.json`
 * describes, serves their builds, and runs and proxies the servers of the
 * ones that have one. Since brief 158 it also installs prebuilt apps from a
 * GitHub URL, which run sandboxed and are served under per-window tokens.
 * `LocalIdentityService`, `DbService` and `UpgradeRoutes` come from global
 * modules.
 */
@Module({
  controllers: [MarketplaceController],
  providers: [
    MarketplaceService,
    MarketplaceServers,
    MarketplaceWsProxy,
    MarketplaceUrlApps,
    SandboxTokens,
    PendingInspections,
  ],
})
export class MarketplaceModule {}
