import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import type { AppIdentity } from '../app-identity/app-identity.types';
import { CallingApp } from '../app-identity/calling-app';
import { MAX_DATA_PATH, kindOf } from './app-data.paths';
import {
  AppDataService,
  type DataEntry,
  type DataFile,
} from './app-data.service';

/** The `code` in a 403's body when a call to `system.data` carries no app. */
export const DATA_NEEDS_APP = 'DATA_NEEDS_APP';

export class DataPathQuery {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_PATH)
  path?: string;
}

export class WriteDataDto {
  @IsString()
  @MaxLength(MAX_DATA_PATH)
  path!: string;

  /** Checked in bytes by the service; the JSON body limit bounds it first. */
  @IsString()
  content!: string;

  /**
   * The version the app read: a string, or null when it read no file. Absent
   * writes whatever is there.
   */
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(128)
  expected?: string | null;
}

/**
 * `/api/system/data/:kind/…`: `system.data`, an app's own folders. The
 * folder is the calling app's, named from its token; a call with no app token
 * (the desktop's own UI, Files, the Terminal) has no folder and is refused.
 *
 * - `GET file?path=` → `{ path, content, version }`, 404 when there is none;
 * - `PUT file` `{ path, content, expected? }` → `{ path, version }`, 409
 *   `{ current }` when `expected` is stale;
 * - `GET list?path=` → the entries, `[]` for a folder not made yet;
 * - `DELETE file?path=` → 204, whether or not there was one.
 */
@Controller('system/data')
export class AppDataController {
  constructor(private readonly data: AppDataService) {}

  @Get(':kind/file')
  async read(
    @CallingApp() app: AppIdentity | null,
    @Param('kind') kind: string,
    @Query() q: DataPathQuery,
  ): Promise<DataFile> {
    const file = await this.data.read(
      needsApp(app),
      kindOf(kind),
      q.path ?? '',
    );
    if (!file) throw new NotFoundException(`No ${q.path ?? ''} in the folder`);
    return file;
  }

  @Put(':kind/file')
  write(
    @CallingApp() app: AppIdentity | null,
    @Param('kind') kind: string,
    @Body() dto: WriteDataDto,
  ): Promise<{ path: string; version: string }> {
    return this.data.write(
      needsApp(app),
      kindOf(kind),
      dto.path,
      dto.content,
      dto.expected,
    );
  }

  @Get(':kind/list')
  list(
    @CallingApp() app: AppIdentity | null,
    @Param('kind') kind: string,
    @Query() q: DataPathQuery,
  ): Promise<DataEntry[]> {
    return this.data.list(needsApp(app), kindOf(kind), q.path ?? '');
  }

  @Delete(':kind/file')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CallingApp() app: AppIdentity | null,
    @Param('kind') kind: string,
    @Query() q: DataPathQuery,
  ): Promise<void> {
    await this.data.remove(needsApp(app), kindOf(kind), q.path ?? '');
  }
}

function needsApp(app: AppIdentity | null): AppIdentity {
  if (app) return app;
  throw new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: DATA_NEEDS_APP,
    message:
      'Only an app has a data folder, and this call carries no app token',
  });
}
