import { Module } from "@nestjs/common";
import { AppDataModule } from "../app-data/app-data.module";
import { ArchiveModule } from "../archive/archive.module";
import { FilesModule } from "../files/files.module";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

/**
 * Backup and restore.
 *
 * Imports rather than reimplements: `FilesService` for the FS jail and
 * `ArchiveService` for the hardened tar extraction a restore runs through.
 * `DbService` is global.
 *
 * `AppDataModule` supplies the data moves, which a restore runs once the swap
 * is in, so a backup from before the move is brought across at once.
 *
 * The restored database carries the *backup's* owner and password, so a
 * restore revokes every session through `LocalIdentityService`, which the
 * global `IdentityModule` provides.
 */
@Module({
  imports: [FilesModule, ArchiveModule, AppDataModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
