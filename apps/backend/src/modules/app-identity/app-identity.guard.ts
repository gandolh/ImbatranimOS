import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import type { Caller } from '../identity/identity.types';
import {
  APP_TOKEN_HEADER,
  APP_TOKEN_REFUSED,
  type AppIdentity,
} from './app-identity.types';
import { AppTokens } from './app-tokens';
import type { IdentifiedRequest } from './calling-app';

/**
 * The second global guard: which app is calling.
 *
 * Registered right after `SessionGuard` in the same `providers` list, so it
 * runs once the session is known: a token only resolves under the session it
 * was minted in. A request without the header is the user's, and gets
 * `appIdentity = null`; one with a token that doesn't resolve is refused with
 * a 403 carrying {@link APP_TOKEN_REFUSED}. Never a 401: the desktop reads a
 * 401 as "signed out" and covers itself with the sign-in screen.
 *
 * A public route has no session to bind a token to, so it ignores the header.
 */
@Injectable()
export class AppIdentityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AppTokens,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx
      .switchToHttp()
      .getRequest<IdentifiedRequest & { caller?: Caller }>();
    req.appIdentity = null;

    const raw = req.headers[APP_TOKEN_HEADER];
    if (raw === undefined) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    // SessionGuard has refused every non-public route without a session, so
    // a caller is always here; without one there is nothing to bind to.
    const caller = req.caller;
    if (!caller) throw refused();

    const identity: AppIdentity | null =
      typeof raw === 'string' ? this.tokens.resolve(raw, caller.sid) : null;
    if (!identity) throw refused();
    req.appIdentity = identity;
    return true;
  }
}

function refused(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: APP_TOKEN_REFUSED,
    message:
      "This app's token is not valid: it was never issued, has ended, or belongs to another session",
  });
}
