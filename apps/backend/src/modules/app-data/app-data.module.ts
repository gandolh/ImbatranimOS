import { Module } from '@nestjs/common';

import { AppIdentityModule } from '../app-identity/app-identity.module';
import { AppDataController } from './app-data.controller';
import { AppDataService } from './app-data.service';

/**
 * `system.data`: each app's folders of its own, one per kind, under
 * `imbatranim/<app-id>/` in `~/.config`, `~/.local/share`, `~/.local/state`
 * and `~/.cache`. Exports {@link AppDataService} for the marketplace's
 * uninstall and for the OS's own one-time moves of an app's data.
 */
@Module({
  imports: [AppIdentityModule],
  controllers: [AppDataController],
  providers: [AppDataService],
  exports: [AppDataService],
})
export class AppDataModule {}
