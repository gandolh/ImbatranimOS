import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { ThrottleService } from './throttle.service';
import { Public } from './public.decorator';
import { SESSION_COOKIE_NAME, readSessionCookie } from './auth.constants';
import { DisableTotpDto, LoginDto, SetupDto, TotpTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly throttle: ThrottleService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---- Public: unlock-screen surface ------------------------------------

  /** Frontend bootstrap: what screen to show (wizard / lock / desktop). */
  @Public()
  @Get('status')
  status(@Req() req: Request) {
    return {
      needsSetup: !this.auth.isSetup(),
      authenticated: !!this.sessions.validateFromRequest(req),
      totpEnabled: this.auth.totpEnabled(),
    };
  }

  /** First run: create the single user, then auto-login. */
  @Public()
  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  async setup(
    @Body() dto: SetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.setup(dto.password);
    this.issueSessionCookie(res);
    return { ok: true };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = req.ip ?? 'unknown';
    this.throttle.assertNotLocked(key);

    const passwordOk =
      this.auth.isSetup() && (await this.auth.verifyPassword(dto.password));
    const totpOk =
      !this.auth.totpEnabled() ||
      (!!dto.token && this.auth.verifyTotp(dto.token));

    if (!passwordOk || !totpOk) {
      this.throttle.recordFailure(key);
      // Generic message: do not reveal which factor failed.
      throw new UnauthorizedException('Invalid credentials');
    }

    this.throttle.reset(key);
    this.issueSessionCookie(res);
    return { ok: true };
  }

  /** Idempotent; public so a stale/invalid cookie can still be cleared. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = readSessionCookie(req);
    if (raw) this.sessions.destroy(raw);
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieClearOpts());
    return { ok: true };
  }

  // ---- Authenticated: TOTP management (settings surface) ----------------

  @Post('totp/enroll')
  @HttpCode(HttpStatus.OK)
  enrollTotp() {
    return this.auth.beginTotpEnroll();
  }

  @Post('totp/enable')
  @HttpCode(HttpStatus.OK)
  enableTotp(@Body() dto: TotpTokenDto) {
    this.auth.confirmTotp(dto.token);
    return { ok: true, totpEnabled: true };
  }

  @Post('totp/disable')
  @HttpCode(HttpStatus.OK)
  async disableTotp(@Body() dto: DisableTotpDto) {
    await this.auth.disableTotp(dto.password);
    return { ok: true, totpEnabled: false };
  }

  // ---- helpers ----------------------------------------------------------

  private issueSessionCookie(res: Response): void {
    const { token, maxAgeMs } = this.sessions.issue();
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  private cookieClearOpts() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
