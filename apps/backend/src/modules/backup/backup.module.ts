import { Module } from '@nestjs/common';
import { ArchiveModule } from '../archive/archive.module';
import { FilesModule } from '../files/files.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/**
 * Backup and restore (brief 80).
 *
 * Imports rather than reimplements: `FilesService` for the FS jail and
 * `ArchiveService` for the hardened tar extraction a restore runs through.
 * `DbService` is global.
 *
 * The restored database carries the *backup's* owner and password, so a
 * restore revokes every session through `LocalIdentityService`, which the
 * global `IdentityModule` provides.
 */
@Module({
  imports: [FilesModule, ArchiveModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
