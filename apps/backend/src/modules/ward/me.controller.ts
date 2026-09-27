import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { WardCaller } from './ward.types';

/** What `GET /api/me` answers. Deliberately narrow — see the controller. */
export interface MeResponse {
  user: { subject: string; username: string };
}

/**
 * `GET /api/me` — who the desktop is signed in as (brief 137).
 *
 * The frontend's session probe (`core/src/modules/auth/api/authApi.ts`). It is
 * guarded like every other route, with no `@Public()`: the guard's 401, 403 and
 * 503 are the answers to "signed out", "signed in without a grant" and "Ward is
 * not answering", and this handler only runs for the one case left.
 *
 * **Never the grants.** Ward's grant map is the whole estate's, so returning it
 * would tell the browser which other apps this account can reach — none of
 * this app's business and nothing the desktop needs.
 */
@Controller('me')
export class MeController {
  @Get()
  me(@Req() req: Request & { ward?: WardCaller }): MeResponse {
    // The guard sets `req.ward` on every request it lets through, so this is a
    // backstop for a route that somehow ran unguarded, not an expected branch.
    if (!req.ward) throw new UnauthorizedException('Authentication required');
    const { subject, username } = req.ward;
    return { user: { subject, username } };
  }
}
