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
 * It used to import `AuthModule` as well, so a restore could revoke every
 * session — the restored database carried the *backup's* credentials, so
 * whoever held a session was no longer necessarily the owner of the password
 * now guarding the machine. That is moot since the Ward cutover: credentials
 * are not in this database at all, so swapping it changes nothing about who may
 * sign in.
 */
@Module({
  imports: [FilesModule, ArchiveModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
