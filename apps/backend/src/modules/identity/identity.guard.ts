import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Env } from '../../config/env.schema';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { LocalIdentityService } from '../local-identity/local-identity.service';
import { AuthenticationError, type Caller } from './identity.types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The global guard (registered via `APP_GUARD`): every route needs a session
 * by default, and a route opts out with `@Public()`. A route added later is
 * guarded by whoever remembers nothing.
 *
 * ## The CSRF check runs before the public check
 *
 * The `imb_session` cookie is `SameSite=Lax`, which already blocks it on a
 * cross-site subresource or form POST; this Origin check on state-changing
 * requests is the backstop. It runs before `@Public()` is consulted on
 * purpose: the setup and sign-in routes are public and they mutate.
 *
 * It does not stop a script on another app of the same origin (the estate
 * shares `gandolh.ro`). That is an accepted risk, recorded in
 * `decisions-estate-era.md` (2026-10-06).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: LocalIdentityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { caller?: Caller }>();

    this.checkOrigin(req);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    try {
      req.caller = await this.identity.authenticate(req.headers.cookie);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException('Authentication required');
      }
      throw error;
    }
    return true;
  }

  /**
   * A present `Origin` must be the configured frontend or the request's own
   * host. An absent one (a same-origin GET, a non-browser client) is allowed,
   * because `SameSite=Lax` covers the case that matters.
   */
  private checkOrigin(req: Request): void {
    if (!MUTATING_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
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
