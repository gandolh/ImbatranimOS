import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Public } from '../auth/public.decorator';
import { AuthenticationError } from '../identity/identity.types';
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

/**
 * The sign-in's routes (brief 152).
 *
 * `GET /api/identity` is public: before anybody is signed in, the desktop has
 * to know whether to show the first-run setup or the sign-in form.
 */
@Controller('identity')
export class LocalIdentityController {
  constructor(private readonly local: LocalIdentityService) {}

  @Public()
  @Get()
  identity(): LocalStatus {
    return this.local.status();
  }

  @Public()
  @Post('local/setup')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setup(@Body() dto: LocalSetupDto): Promise<void> {
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
      if (err instanceof AuthenticationError) {
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
    try {
      await this.local.changePassword(
        dto.current,
        dto.next,
        req.headers.cookie,
      );
    } catch (err) {
      if (err instanceof AuthenticationError)
        throw new UnauthorizedException(err.message);
      if (err instanceof SetupRefusedError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }
}
