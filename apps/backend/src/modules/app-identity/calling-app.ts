import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

import { APP_TOKEN_HEADER, type AppIdentity } from "./app-identity.types";

/** A request once the guards have run: `appIdentity` is set by `AppIdentityGuard`. */
export type IdentifiedRequest = Request & { appIdentity?: AppIdentity | null };

/**
 * The app making this call, or null when it is the user's (no token: the
 * desktop's own UI, Files, the Terminal).
 *
 * Fails closed: a request that carries a token the guard never looked at
 * (a module graph without `AppIdentityGuard`) throws instead of passing for
 * the user, which would hand that app everything.
 */
export function callingApp(req: IdentifiedRequest): AppIdentity | null {
  if (req.appIdentity !== undefined) return req.appIdentity;
  if (req.headers[APP_TOKEN_HEADER] !== undefined) {
    throw new Error("This request carries an app token, but AppIdentityGuard did not run");
  }
  return null;
}

/**
 * The handler parameter twin of {@link callingApp}:
 *
 *   @Get('thing')
 *   thing(@CallingApp() app: AppIdentity | null) { ... }
 */
export const CallingApp = createParamDecorator((_data: unknown, ctx: ExecutionContext): AppIdentity | null =>
  callingApp(ctx.switchToHttp().getRequest<IdentifiedRequest>()),
);

/** The `code` in a 403's body when a route only the user may call is called by an app. */
export const USER_ONLY = "USER_ONLY";

/**
 * Refuse an app: the route is the user's alone (the Trash, archives,
 * backups), reached through Files or Settings, which call as the user.
 */
export function requireUser(app: AppIdentity | null, what: string): void {
  if (app === null) return;
  throw new ForbiddenException({
    statusCode: 403,
    error: "Forbidden",
    code: USER_ONLY,
    message: `${app.appId} may not ${what}: only the user may`,
  });
}

/**
 * {@link requireUser} for a whole controller: `@UseGuards(UserOnlyGuard)`.
 * It runs after the global guards, so the caller is already known.
 */
@Injectable()
export class UserOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== "http") return true;
    const req = ctx.switchToHttp().getRequest<IdentifiedRequest>();
    requireUser(callingApp(req), `call ${req.path}`);
    return true;
  }
}
