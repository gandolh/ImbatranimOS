import { Module } from "@nestjs/common";

import { AppIdentityModule } from "../app-identity/app-identity.module";
import { FilesModule } from "../files/files.module";
import { AppDataController } from "./app-data.controller";
import { AppDataService } from "./app-data.service";
import { DataMovesService } from "./data-moves.service";
import { SetAsideController } from "./set-aside.controller";
import { SetAsideService } from "./set-aside.service";

/**
 * `system.data`: each app's folders of its own, one per kind, under
 * `imbatranim/<app-id>/` in `~/.config`, `~/.local/share`, `~/.local/state`
 * and `~/.cache`. Exports {@link AppDataService} for the marketplace's
 * uninstall, and {@link DataMovesService} for a backup restore, which runs the
 * moves at once. {@link DataMovesService} moves the data the OS kept for Todo
 * and Bookmarks into their folders, once, and Git GUI's recent repositories
 * into its state folder and the OS recents (`FilesModule`'s).
 * {@link SetAsideService} hands the owner what a move set aside, as a
 * `.tar.gz`, or drops it.
 */
@Module({
  imports: [AppIdentityModule, FilesModule],
  controllers: [AppDataController, SetAsideController],
  providers: [AppDataService, DataMovesService, SetAsideService],
  exports: [AppDataService, DataMovesService],
})
export class AppDataModule {}
