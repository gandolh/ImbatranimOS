import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import {
  identityModeOf,
  type Env,
  type IdentityMode,
} from '../../config/env.schema';
import { Public } from '../auth/public.decorator';
import { WardAuthenticationError } from '../ward/ward.types';
import {
  LocalPasswordDto,
  LocalSetupDto,
  LocalSignInDto,
} from './dto/local-identity.dto';
import {
  LOCAL_SESSION_COOKIE,
  LocalIdentityService,
  SetupRefusedError,
  ThrottledError,
  type LocalStatus,
} from './local-identity.service';

/**
 * Whether the browser reached us over HTTPS, so the session cookie gets
 * `Secure`. `X-Forwarded-Proto` counts even when TRUST_PROXY is off (it must
 * stay off behind Caddy, which appends to `X-Forwarded-For`): read only to
 * ADD `Secure`, a forged value can at worst make the cookie stricter.
 */
function overHttps(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  const first = (Array.isArray(proto) ? proto[0] : proto)
    ?.split(',')[0]
    ?.trim();
  return req.secure || first === 'https';
}

export interface IdentityResponse {
  mode: IdentityMode;
  /** Present in local mode only. */
  local?: LocalStatus;
}

/**
 * Which sign-in this machine uses, and the local one's routes (brief 152).
 *
 * `GET /api/identity` is public: before anybody is signed in, the desktop has
 * to know whether to hand off to Ward or show its own form. The local routes
 * answer 404 while Ward is configured, so a Ward install exposes no password
 * surface at all.
 */
@Controller('identity')
export class LocalIdentityController {
  private readonly mode: IdentityMode;

  constructor(
    private readonly local: LocalIdentityService,
    config: ConfigService<Env, true>,
  ) {
    this.mode = identityModeOf({
      WARD_PUBLIC_ORIGIN: config.get('WARD_PUBLIC_ORIGIN', { infer: true }),
    });
  }

  @Public()
  @Get()
  identity(): IdentityResponse {
    return this.mode === 'local'
      ? { mode: 'local', local: this.local.status() }
      : { mode: 'ward' };
  }

  @Public()
  @Post('local/setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setup(@Body() dto: LocalSetupDto): Promise<void> {
    this.requireLocal();
    try {
      await this.local.setUp(dto);
    } catch (err) {
      if (err instanceof SetupRefusedError) {
        throw this.local.status().setUp
          ? new ConflictException(err.message)
          : new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Public()
  @Post('local/sign-in')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signIn(
    @Body() dto: LocalSignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.requireLocal();
    try {
      const { token, expiresAt } = await this.local.signIn(
        dto.password,
        req.ip ?? 'unknown',
      );
      res.cookie(LOCAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: overHttps(req),
        path: '/',
        expires: new Date(expiresAt),
      });
    } catch (err) {
      if (err instanceof ThrottledError) {
        res.setHeader(
          'Retry-After',
          String(Math.ceil(err.retryAfterMs / 1000)),
        );
        throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (err instanceof WardAuthenticationError) {
        throw new UnauthorizedException('Wrong password');
      }
      throw err;
    }
  }

  @Public()
  @Post('local/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): void {
    this.requireLocal();
    this.local.signOut(req.headers.cookie);
    res.clearCookie(LOCAL_SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
    });
  }

  /** Guarded like every route: only a signed-in owner may change the password. */
  @Post('local/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async password(
    @Body() dto: LocalPasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    this.requireLocal();
    try {
      await this.local.changePassword(
        dto.current,
        dto.next,
        req.headers.cookie,
      );
    } catch (err) {
      if (err instanceof WardAuthenticationError)
        throw new UnauthorizedException(err.message);
      if (err instanceof SetupRefusedError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }

  private requireLocal(): void {
    if (this.mode !== 'local') throw new NotFoundException();
  }
}
