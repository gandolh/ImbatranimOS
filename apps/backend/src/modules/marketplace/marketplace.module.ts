import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controller';
import { MarketplaceServers } from './marketplace-servers.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceWsProxy } from './marketplace-ws.proxy';

/**
 * The app marketplace (brief 120): installs the apps `marketplace/*.json`
 * describes, serves their builds, and runs and proxies the servers of the
 * ones that have one. `LocalIdentityService`, `DbService` and
 * `UpgradeRoutes` come from global modules.
 */
@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplaceServers, MarketplaceWsProxy],
})
export class MarketplaceModule {}
