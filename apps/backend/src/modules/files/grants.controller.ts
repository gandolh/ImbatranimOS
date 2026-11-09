import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import * as fs from 'fs/promises';

import {
  SYSTEM_GROUP,
  type AppIdentity,
} from '../app-identity/app-identity.types';
import { APP_ID, INSTANCE_ID } from '../app-identity/app-tokens.controller';
import { CallingApp, requireUser } from '../app-identity/calling-app';
import {
  FileGrants,
  type GrantKind,
} from '../app-identity/file-grants.service';
import type { ModeOp } from '../app-identity/mode-store.service';
import { FilesService } from './files.service';
import { RecentService } from './recent.service';

/** The virtual roots the files API serves. */
const ROOTS = ['home', 'notes'] as const;

export class GrantFileDto {
  /** The running copy given the file: its window's id. */
  @IsString()
  @Matches(INSTANCE_ID)
  instanceId!: string;

  /** The app that copy runs; the grant holds only for that app. */
  @IsString()
  @Matches(APP_ID)
  appId!: string;

  @IsIn(ROOTS)
  root!: string;

  /** Root-relative; `''` is the root itself (a folder picked at the top). */
  @IsString()
  @MaxLength(1024)
  path!: string;

  /**
   * What the caller expects to give: the Open and Save dialogs give a file,
   * the folder chooser a folder. Absent, what is there decides.
   */
  @IsOptional()
  @IsIn(['file', 'folder'])
  expect?: GrantKind;
}

/**
 * `/api/files/grants`: how a running copy of an app is given a file.
 *
 * - `POST` gives `instanceId` the path. Made as the user, it is the OS giving
 *   it: core calls it as it opens a file with an app (Files, Start's recent
 *   files, Open With) and once a pick in its Open, Save or folder dialog
 *   settles. Made with an app's token, it is that app handing on what it
 *   holds (opening a file it has in another app, or in another window of its
 *   own), and the app must hold it itself: read and write on a file, listing
 *   and writing on a folder, or making a file not there yet. One more: an
 *   app may give a window of its own a file among its own recent files, so
 *   it reopens one in a new window as Start's recents would. Core makes an
 *   app's `openApp` this way, with the app's token, so an app can't open
 *   itself with a path to be given it.
 * - `DELETE :instanceId` ends what a copy was given: its window closed. The
 *   user's alone.
 *
 * What is there decides the grant: a folder is given with everything under
 * it, a file (or a path with nothing there yet, a Save as) by itself.
 */
@Controller('files/grants')
export class GrantsController {
  constructor(
    private readonly files: FilesService,
    private readonly grants: FileGrants,
    private readonly recent: RecentService,
  ) {}

  @Post()
  @HttpCode(204)
  async grant(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: GrantFileDto,
  ): Promise<void> {
    if (dto.appId === SYSTEM_GROUP) {
      throw new BadRequestException(`${SYSTEM_GROUP} is a group, not an app`);
    }
    const { abs, key } = await this.files.resolveSafe(dto.root, dto.path);
    const stat = await fs.stat(abs).catch(() => null);
    if (stat && !stat.isFile() && !stat.isDirectory()) {
      throw new BadRequestException('Only a file or a folder can be given');
    }
    const kind: GrantKind = stat?.isDirectory() ? 'folder' : 'file';
    if (!stat && dto.expect === 'folder') {
      throw new NotFoundException('There is no folder there');
    }
    if (dto.expect !== undefined && dto.expect !== kind) {
      throw new BadRequestException(
        kind === 'folder' ? 'That is a folder' : 'That is not a folder',
      );
    }
    const ownRecent =
      who !== null &&
      who.appId === dto.appId &&
      stat?.isFile() === true &&
      this.recent.isRecentOf(dto.root, dto.path, who.appId);
    if (who !== null && !ownRecent) {
      // Handing on gives what the app holds, never more.
      const ops: ModeOp[] =
        kind === 'folder'
          ? ['list', 'write']
          : stat
            ? ['read', 'write']
            : ['create'];
      for (const op of ops) {
        this.files.assertCan(who, op, key, dto.root, dto.path);
      }
    }
    this.grants.grant(
      { instanceId: dto.instanceId, appId: dto.appId },
      key,
      kind,
    );
  }

  @Delete(':instanceId')
  @HttpCode(204)
  revoke(
    @CallingApp() who: AppIdentity | null,
    @Param('instanceId') instanceId: string,
  ): void {
    requireUser(who, 'end what a window was given');
    if (!INSTANCE_ID.test(instanceId)) {
      throw new BadRequestException('Not an instance id');
    }
    this.grants.revokeInstance(instanceId);
  }
}
