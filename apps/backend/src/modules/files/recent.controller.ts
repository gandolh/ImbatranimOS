import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import type { AppIdentity } from '../app-identity/app-identity.types';
import { CallingApp, requireUser } from '../app-identity/calling-app';
import { FilesService } from './files.service';
import { RecentService, type RecentFile } from './recent.service';
import { RecordRecentDto, RemoveRecentQueryDto } from './dto/recent.dto';

/**
 * OS-wide recent files. Session-authed by the global guard.
 * `DELETE /files/recent/all` is a separate route rather than "DELETE with no
 * params" so clearing everything can never be an accidental validation hole.
 *
 * Start reopens a recent file through the OS, which gives it to the app
 * again, so what an app may record is held to what it may read: an app can't
 * plant a file it was never given in the list for the owner to hand it later.
 * An app sees and removes only its own entries; the whole list, and clearing
 * it, are the user's.
 */
@Controller('files/recent')
export class RecentController {
  constructor(
    private readonly recent: RecentService,
    private readonly files: FilesService,
  ) {}

  @Get()
  list(@CallingApp() who: AppIdentity | null): RecentFile[] {
    const all = this.recent.list();
    return who === null ? all : all.filter((r) => r.appId === who.appId);
  }

  @Post()
  @HttpCode(204)
  async record(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: RecordRecentDto,
  ): Promise<void> {
    if (who !== null) {
      if (dto.appId !== who.appId) {
        throw new ForbiddenException(
          `${who.appId} may not record a recent file for ${dto.appId}`,
        );
      }
      await this.files.check(who, 'read', dto.root, dto.path);
    }
    this.recent.record(dto.root, dto.path, dto.appId);
  }

  @Delete('all')
  @HttpCode(204)
  clear(@CallingApp() who: AppIdentity | null): void {
    requireUser(who, 'clear the recent files');
    this.recent.clear();
  }

  @Delete()
  @HttpCode(204)
  remove(
    @CallingApp() who: AppIdentity | null,
    @Query() query: RemoveRecentQueryDto,
  ): void {
    this.recent.remove(query.root, query.path, who?.appId);
  }
}
