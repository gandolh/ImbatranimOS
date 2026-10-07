import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { Caller } from './identity.types';

/** What `GET /api/me` answers. */
export interface MeResponse {
  user: { subject: string; username: string };
}

/**
 * `GET /api/me`: who the desktop is signed in as.
 *
 * The frontend's session probe (`core/src/modules/auth/api/authApi.ts`). It is
 * guarded like every other route, with no `@Public()`: the guard's 401 means
 * signed out, and this handler only runs for a live session.
 */
@Controller('me')
export class MeController {
  @Get()
  me(@Req() req: Request & { caller?: Caller }): MeResponse {
    // The guard sets `req.caller` on every request it lets through, so this is
    // a backstop for a route that somehow ran unguarded.
    if (!req.caller) throw new UnauthorizedException('Authentication required');
    const { subject, username } = req.caller;
    return { user: { subject, username } };
  }
}
