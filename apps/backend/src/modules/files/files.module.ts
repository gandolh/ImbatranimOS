import { Module } from '@nestjs/common';
import { AppIdentityModule } from '../app-identity/app-identity.module';
import { FileAccess } from './file-access';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { GrantsController } from './grants.controller';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';
import { RecentController } from './recent.controller';
import { RecentService } from './recent.service';

/**
 * The files API, checked against the calling app: its modes and what its
 * window was given (`AppIdentityModule`'s `ModeStore` and `FileGrants`).
 */
@Module({
  imports: [AppIdentityModule],
  controllers: [
    FilesController,
    GrantsController,
    TrashController,
    RecentController,
  ],
  providers: [FilesService, FileAccess, TrashService, RecentService],
  exports: [FilesService, TrashService],
})
export class FilesModule {}
