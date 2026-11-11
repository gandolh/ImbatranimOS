import { Module } from "@nestjs/common";

import { AppDataModule } from "../app-data/app-data.module";
import { AppIdentityModule } from "../app-identity/app-identity.module";
import { FilesModule } from "../files/files.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceServers } from "./marketplace-servers.service";
import { MarketplaceUrlApps } from "./marketplace-url.service";
import { MarketplaceService } from "./marketplace.service";
import { MarketplaceWsProxy } from "./marketplace-ws.proxy";
import { PendingInspections } from "./pending-inspections";

/**
 * The app marketplace: installs the apps `marketplace/*.json`
 * describes, serves their builds, and runs and proxies the servers of the
 * ones that have one. It also installs apps from a GitHub URL, built from
 * source and run natively once verified or trusted (`MarketplaceUrlApps`).
 * `LocalIdentityService`, `AppTokens`, `DbService` and `UpgradeRoutes` come
 * from global modules; `FileGrants` and `InstalledApps` from app identity.
 */
@Module({
  imports: [AppDataModule, AppIdentityModule, FilesModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplaceServers, MarketplaceWsProxy, MarketplaceUrlApps, PendingInspections],
})
export class MarketplaceModule {}
