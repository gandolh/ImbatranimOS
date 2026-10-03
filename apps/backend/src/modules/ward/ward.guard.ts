import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Env } from '../../config/env.schema';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { WardFreshness } from './ward-freshness';
import { WardService } from './ward.service';
import {
  IMBATRANIMOS_APP_SLUG,
  WardAuthenticationError,
  WardUnavailableError,
  type WardCaller,
} from './ward.types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The global guard (registered via `APP_GUARD`): every route is authenticated
 * by default, and a route opts out with `@Public()`.
 *
 * ## What survived from `SessionAuthGuard`, and what did not
 *
 * **The shape survived**, and it was the good part: authenticated-by-default
 * with an explicit opt-out, so a route added later is guarded by whoever
 * remembers nothing rather than by whoever remembers something. The `@Public()`
 * decorator is unchanged and still lives in `auth/`.
 *
 * **The session machinery is gone** — the `imb_session` cookie, the server-side
 * session store, the sliding-expiry renewal, the scrypt password check and the
 * login throttle. Identity is Ward's.
 *
 * **The sliding expiry went with it, and its job is done better.** That code
 * re-issued the cookie with a fresh `Max-Age` at most hourly so daily use never
 * expired a session mid-keystroke. Ward solves the same problem with a
 * 15-minute access token and a 30-day rotating refresh token, refreshed by the
 * browser against Ward directly — so this app neither sets nor extends a
 * cookie, and could not: the cookie is Ward's, on Ward's terms.
 *
 * ## The CSRF check stays, and stays *before* the public check
 *
 * `SameSite=Lax` on Ward's cookie already blocks the cross-site subresource
 * case, and this Origin check on state-changing requests is the backstop. It
 * runs before `@Public()` is consulted, deliberately: a public route that
 * mutates is exactly the one an attacker would pick.
 *
 * ## Three outcomes
 *
 * - **401** — no session, or a dead one. Sign in at Ward.
 * - **403** — a live Ward session holding **no `imbatranimos` grant**. Holding a
 *   Ward account confers nothing; the grant is the estate's security boundary.
 *   This must not be a 401: the person is already signed in, and only a
 *   superuser issuing a grant resolves it.
 * - **503** — Ward unreachable, or this app's own key refused. **Fails closed**,
 *   and never reported as "signed out" — telling somebody to sign in when the
 *   identity service is down sends them somewhere that cannot help.
 */
@Injectable()
export class WardAuthGuard implements CanActivate {
  private readonly logger = new Logger(WardAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ward: WardService,
    private readonly config: ConfigService<Env, true>,
    private readonly freshness: WardFreshness,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { ward?: WardCaller }>();

    // Before the public check, so login-adjacent and setup routes are covered
    // too — a public route that mutates is the one worth protecting most.
    this.checkOrigin(req);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    let session: WardCaller;
    try {
      session = await this.ward.authenticate(req.headers.cookie);
    } catch (error) {
      // Ordered most specific first. `WardConfigurationError` extends
      // `WardUnavailableError`, so this catches both — which is the point of
      // that subclassing: no extra branch is needed to fail closed on this
      // app's own misconfiguration.
      if (error instanceof WardUnavailableError) {
        this.logger.error(
          `Ward is not answering; failing closed: ${String(error)}`,
        );
        throw new ServiceUnavailableException(
          'Sign-in is temporarily unavailable',
        );
      }
      if (error instanceof WardAuthenticationError) {
        throw new UnauthorizedException('Authentication required');
      }
      throw error;
    }

    /*
     * Any grant for this app opens it. imbatranimOS is a single-operator
     * desktop shell with no roles of its own, so inventing a hierarchy here
     * would be a second, unenforced definition of authority. What matters is
     * that a Ward account holding **no** grant for this app is refused — which
     * is what lets prm keep public registration open without those accounts
     * reaching a machine's terminal and filesystem.
     */
    const roles = session.grants[IMBATRANIMOS_APP_SLUG] ?? [];
    if (roles.length === 0) {
      this.logger.warn(
        `Live Ward session for ${session.subject} holds no ${IMBATRANIMOS_APP_SLUG} grant`,
      );
      throw new ForbiddenException('This account has no access to this system');
    }

    req.ward = session;
    // The terminal sweep checks open shells against this (brief 145): a
    // WebSocket keeps the cookie it opened with, which expires in 15 minutes.
    this.freshness.note(session.sid, req.headers.cookie);
    return true;
  }

  /**
   * CSRF stance, unchanged from the session guard it replaces.
   *
   * Ward's cookie is `SameSite=Lax`, which blocks it on a cross-site
   * subresource or form POST; this Origin check on state-changing requests is
   * the backstop. An absent `Origin` — a same-origin GET, a non-browser client
   * — is allowed, because Lax already covers the case that matters.
   */
  private checkOrigin(req: Request): void {
    if (!MUTATING_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return; // no Origin => not a cross-site browser form post
    const frontend = this.config.get('FRONTEND_URL', { infer: true });
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ForbiddenException('Bad origin');
    }
    if (origin === frontend || originHost === req.headers.host) return;
    throw new ForbiddenException('Cross-origin request rejected');
  }
}
