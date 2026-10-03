import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route (or a whole controller) out of the global `WardAuthGuard`.
 * Nothing carries it today: signing in is Ward's, so there is no login or
 * setup route here to open up. Keep it for a genuinely public endpoint (a
 * health probe), never for anything that reads or changes the user's data.
 *
 *   @Public()
 *   @Get('health')
 *   health() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
