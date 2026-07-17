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
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionService } from './session.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global guard (registered via APP_GUARD): every route requires a valid
 * session cookie unless explicitly marked {@link Public}. Also enforces the
 * CSRF stance — see checkOrigin.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { session?: unknown }>();

    // CSRF defence runs before the public check so login/setup are covered too.
    this.checkOrigin(req);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const session = this.sessions.validateFromRequest(req);
    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }
    req.session = session;
    return true;
  }

  /**
   * CSRF stance: session cookie is SameSite=Lax (blocks it on cross-site
   * subresource/POST), backed by an Origin check on state-changing requests.
   * When an Origin header is present it must match the request Host or the
   * configured FRONTEND_URL. Absent Origin (same-origin GET, non-browser
   * clients) is allowed — Lax already covers the cross-site cookie case.
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
