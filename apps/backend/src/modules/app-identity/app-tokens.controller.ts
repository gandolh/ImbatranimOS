import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';

import { DbService } from '../../db/db.service';
import type { Caller } from '../identity/identity.types';
import {
  APP_TOKEN_HEADER,
  SYSTEM_GROUP,
  type AppIdentity,
} from './app-identity.types';
import { APP_TOKEN_SHAPE, AppTokens } from './app-tokens';
import { callingApp, type IdentifiedRequest } from './calling-app';
import { FileGrants } from './file-grants.service';
import { groupsOf } from './install-group';

/** An app id, as the marketplace and the built-ins write them. */
export const APP_ID = /^[a-z][a-z0-9-]{1,39}$/;
/** Core's window ids are UUIDs; a windowless copy gets a random id of the same shape. */
export const INSTANCE_ID = /^[A-Za-z0-9-]{1,64}$/;

export class RegisterAppTokenDto {
  @IsString()
  @Matches(APP_TOKEN_SHAPE)
  token!: string;

  @IsString()
  @Matches(APP_ID)
  appId!: string;

  @IsString()
  @Matches(INSTANCE_ID)
  instanceId!: string;

  @IsOptional()
  @IsString()
  @Matches(INSTANCE_ID)
  windowId?: string | null;
}

/** What registering a token, or asking who you are, answers. */
export interface AppIdentityResponse {
  app: AppIdentity | null;
}

type Req = IdentifiedRequest & { caller?: Caller };

/**
 * `/api/system/app-tokens`: core's side of app identity.
 *
 * - `POST` registers a token core minted for a running copy of an app. Only
 *   the user may (a call with no app token): an app can't start an identity.
 * - `DELETE self` ends the token the call carries, as closing the copy does,
 *   and with it what the copy was given.
 * - `GET self` says who the call is from: the user, or which app and copy.
 */
@Controller('system/app-tokens')
export class AppTokensController {
  constructor(
    private readonly tokens: AppTokens,
    private readonly dbs: DbService,
    private readonly grants: FileGrants,
  ) {}

  @Post()
  @HttpCode(201)
  register(
    @Body() body: RegisterAppTokenDto,
    @Req() req: Req,
  ): AppIdentityResponse {
    if (callingApp(req) !== null) {
      throw new ForbiddenException('An app cannot start an app identity');
    }
    const caller = mustHaveCaller(req);
    if (body.appId === SYSTEM_GROUP) {
      throw new BadRequestException(`${SYSTEM_GROUP} is a group, not an app`);
    }
    const identity: AppIdentity = {
      appId: body.appId,
      instanceId: body.instanceId,
      windowId: body.windowId ?? null,
      groups: groupsOf(this.dbs, body.appId),
    };
    if (this.tokens.register(body.token, caller.sid, identity) === 'taken') {
      throw new ConflictException('That token is already registered');
    }
    return { app: identity };
  }

  @Delete('self')
  @HttpCode(204)
  revoke(@Req() req: Req): void {
    const app = callingApp(req);
    if (app === null) {
      throw new BadRequestException('This call carries no app token');
    }
    // The guard resolved it, so it is a single, well-formed header.
    this.tokens.revoke(req.headers[APP_TOKEN_HEADER] as string);
    this.grants.revokeInstance(app.instanceId);
  }

  @Get('self')
  self(@Req() req: Req): AppIdentityResponse {
    return { app: callingApp(req) };
  }
}

function mustHaveCaller(req: Req): Caller {
  // SessionGuard refused this route already without a session.
  if (!req.caller) throw new ForbiddenException('No session');
  return req.caller;
}
