import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { GitController } from './git.controller';
import { GitService } from './git.service';

/**
 * Imports FilesModule to reuse its exported FilesService — specifically
 * `resolveSafe`, the FS jail — so the repo directory (used only as an execa
 * `cwd`) can never escape the home root. The jail is NOT reimplemented here.
 */
@Module({
  imports: [FilesModule],
  controllers: [GitController],
  providers: [GitService],
})
export class GitModule {}
