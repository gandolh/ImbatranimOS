import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route (or a whole controller) out of the global {@link SessionAuthGuard}.
 * Use ONLY for login / first-run setup / status. Everything else is
 * authenticated by default.
 *
 *   @Public()
 *   @Post('login')
 *   login() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
