import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import * as fs from 'fs/promises';
import { dirname } from 'path';

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
  expect?: 'file' | 'folder';

  /**
   * Also give the file's folder to read (list it, read the files directly in
   * it): an open the OS makes for an app that declares it reads the opened
   * file's folder. The user's alone; skipped when the folder isn't there yet.
   */
  @IsOptional()
  @IsBoolean()
  withFolder?: boolean;
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
 *   and writing on a folder, or making a file not there yet; a file it may
 *   only read goes on to read only. One more: an
 *   app may give a window of its own a file among its own recent files (or
 *   a folder among its own recent repositories), so it reopens one in a new
 *   window as Start's recents would. Core makes an
 *   app's `openApp` this way, with the app's token, so an app can't open
 *   itself with a path to be given it.
 * - `DELETE :instanceId` ends what a copy was given: its window closed. The
 *   user's alone.
 *
 * What is there decides the grant: a folder is given with everything under
 * it, a file (or a path with nothing there yet, a Save as) by itself. With
 * `withFolder`, a file's folder is given to read as well (a `listing`), which
 * only the OS gives: an app's own open never gets the folder.
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
    if (dto.withFolder && who !== null) {
      throw new ForbiddenException(
        `${who.appId} may not give a file's folder: only the OS does`,
      );
    }
    if (dto.withFolder && kind !== 'file') {
      throw new BadRequestException('Only a file comes with its folder');
    }
    if (dto.expect !== undefined && dto.expect !== kind) {
      throw new BadRequestException(
        kind === 'folder' ? 'That is a folder' : 'That is not a folder',
      );
    }
    const ownRecent =
      who !== null &&
      who.appId === dto.appId &&
      (stat?.isFile() === true
        ? this.recent.isRecentOf(dto.root, dto.path, who.appId)
        : stat?.isDirectory() === true &&
          this.recent.isRecentRepoOf(dto.root, dto.path, who.appId));
    let given: GrantKind = kind;
    if (who !== null && !ownRecent) {
      // Handing on gives what the app holds, never more: a file it may only
      // read (one beside a file it was opened with) goes on to read only.
      const readOnly =
        kind === 'file' &&
        stat !== null &&
        this.files.can(who, 'read', key) !== null &&
        this.files.can(who, 'write', key) === null;
      const ops: ModeOp[] = readOnly
        ? ['read']
        : kind === 'folder'
          ? ['list', 'write']
          : stat
            ? ['read', 'write']
            : ['create'];
      for (const op of ops) {
        this.files.assertCan(who, op, key, dto.root, dto.path);
      }
      if (readOnly) given = 'read';
    }
    const target = { instanceId: dto.instanceId, appId: dto.appId };
    this.grants.grant(target, key, given);
    if (dto.withFolder) {
      const there = await fs.stat(dirname(abs)).catch(() => null);
      if (dirname(key) !== key && there?.isDirectory()) {
        this.grants.grant(target, dirname(key), 'listing');
      }
    }
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
