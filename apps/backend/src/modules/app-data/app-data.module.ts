import { Module } from '@nestjs/common';

import { AppIdentityModule } from '../app-identity/app-identity.module';
import { FilesModule } from '../files/files.module';
import { AppDataController } from './app-data.controller';
import { AppDataService } from './app-data.service';
import { DataMovesService } from './data-moves.service';

/**
 * `system.data`: each app's folders of its own, one per kind, under
 * `imbatranim/<app-id>/` in `~/.config`, `~/.local/share`, `~/.local/state`
 * and `~/.cache`. Exports {@link AppDataService} for the marketplace's
 * uninstall. {@link DataMovesService} moves the data the OS kept for Todo
 * and Bookmarks into their folders, once, and Git GUI's recent repositories
 * into its state folder and the OS recents (`FilesModule`'s).
 */
@Module({
  imports: [AppIdentityModule, FilesModule],
  controllers: [AppDataController],
  providers: [AppDataService, DataMovesService],
  exports: [AppDataService],
})
export class AppDataModule {}
