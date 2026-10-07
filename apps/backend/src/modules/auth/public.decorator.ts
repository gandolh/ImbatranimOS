import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route (or a whole controller) out of the global `SessionGuard`.
 * The sign-in's setup, sign-in, sign-out and status routes carry it. Never
 * use it for anything that reads or changes the owner's data.
 *
 *   @Public()
 *   @Get('health')
 *   health() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
