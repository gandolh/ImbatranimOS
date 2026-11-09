import { Module } from '@nestjs/common';

import { AppDataModule } from '../app-data/app-data.module';
import { AppIdentityModule } from '../app-identity/app-identity.module';
import { FilesModule } from '../files/files.module';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceServers } from './marketplace-servers.service';
import { MarketplaceUrlApps } from './marketplace-url.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceWsProxy } from './marketplace-ws.proxy';
import { PendingInspections } from './pending-inspections';
import { SandboxTokens } from './sandbox-tokens';

/**
 * The app marketplace: installs the apps `marketplace/*.json`
 * describes, serves their builds, and runs and proxies the servers of the
 * ones that have one. Since sandboxed apps from a URL it also installs prebuilt apps from a
 * GitHub URL, which run sandboxed and are served under per-window tokens.
 * `LocalIdentityService`, `AppTokens`, `DbService` and `UpgradeRoutes` come
 * from global modules; `FileGrants` and `InstalledApps` from app identity.
 */
@Module({
  imports: [AppDataModule, AppIdentityModule, FilesModule],
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
