import { z } from 'zod';

// Env booleans arrive as strings ("true"/"1"). Coerce leniently; unset -> default.
const envBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? def : v === 'true' || v === '1',
    );

export const envSchema = z
  .object({
    PORT: z.coerce.number().default(3001),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    DB_PATH: z.string().default('../../data/db.sqlite'),
    NOTES_DIR: z.string().default('../../data/notes'),
    CONFIGS_DIR: z.string().default('../../data/configs'),
    // When set (prod image), Nest serves the built frontend from this dir on
    // the same port as the API. Unset in dev — Vite serves the frontend.
    STATIC_ROOT: z.string().optional(),
    // --- Identity: Ward, or a local sign-in --------------------------------
    //
    // Inside the estate, identity is Ward's: the browser holds a `ward_session`
    // cookie for the whole origin, verified locally against Ward's JWKS and then
    // introspected for liveness. Set all three WARD_* variables for that.
    //
    // With NONE of them set, the backend runs its own single-owner sign-in
    // instead (decided 2026-10-04, brief 152 option C): a password chosen on
    // first run, an httpOnly session cookie and a login throttle. That is what a
    // standalone run, a friend's Docker install and the server ISO use. Setting
    // only some of the three is refused at boot (see `.superRefine` below): a
    // half-configured Ward is a typo, not a choice of mode.

    // Ward's public origin, and the exact `iss` on every access token.
    WARD_PUBLIC_ORIGIN: z.string().url().optional(),
    // Ward's prefix behind Caddy: `/ward-api`.
    //
    // Deliberately undefaulted. An empty value resolves the JWKS to
    // `<origin>/.well-known/jwks.json`, a path nothing serves — which would make
    // this app reject every token, with a clean log, on the deploy that carried
    // the mistake.
    WARD_API_BASE_PATH: z.string().min(1).optional(),
    // This app's own Ward service key, sent as `x-ward-app-key`. A SECRET:
    // server-side only, never logged in full, never exposed to the frontend.
    // Issued from Ward's console, shown once, not readable back.
    WARD_APP_KEY: z.string().min(1).optional(),

    // Local sign-in only. When set, the first-run claim needs this token as well
    // as a new password, so a machine reachable on a network cannot be claimed
    // by whoever gets there before its owner. Printed by the operator (or the
    // ISO's first boot), never by the app. Ignored once the machine is claimed.
    SETUP_TOKEN: z.string().min(1).optional(),

    // --- The Browser app's proxy origin (brief 50) ---------------------------
    //
    // Proxied web pages run on an origin of their own, never the desktop's: a
    // rewriter escape on the desktop origin would hold the session and the
    // terminal. The backend listens for that origin on this second port. Unset,
    // the Browser app is off and says so.
    BROWSER_PROXY_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    // Where the viewing browser reaches that port, when it is not
    // FRONTEND_URL's scheme and host with BROWSER_PROXY_PORT (a TLS proxy in
    // front, for instance). Must differ from FRONTEND_URL's origin.
    BROWSER_PROXY_ORIGIN: z.string().url().optional(),

    // Trust X-Forwarded-* from a front proxy so req.ip / protocol are real
    // (needed for correct secure-cookie behaviour behind Caddy/nginx). Keep
    // false when exposed directly.
    TRUST_PROXY: envBool(false),
  })
  .superRefine((env, ctx) => {
    const ward = [
      env.WARD_PUBLIC_ORIGIN,
      env.WARD_API_BASE_PATH,
      env.WARD_APP_KEY,
    ];
    const set = ward.filter((v) => v !== undefined).length;
    if (set !== 0 && set !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WARD_PUBLIC_ORIGIN'],
        message:
          'Set all three of WARD_PUBLIC_ORIGIN, WARD_API_BASE_PATH and WARD_APP_KEY to use Ward, or none of them for the local sign-in.',
      });
    }
    if (env.BROWSER_PROXY_ORIGIN && env.BROWSER_PROXY_PORT === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BROWSER_PROXY_ORIGIN'],
        message: 'BROWSER_PROXY_ORIGIN needs BROWSER_PROXY_PORT as well.',
      });
    }
    const proxy = browserProxyOriginOf(env);
    if (proxy && proxy === new URL(env.FRONTEND_URL).origin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BROWSER_PROXY_ORIGIN'],
        message:
          "The Browser's proxy origin must differ from the desktop's (FRONTEND_URL): proxied pages would otherwise run with the desktop's rights.",
      });
    }
  });

/**
 * The origin proxied pages run on, or null when the Browser is off: the
 * explicit BROWSER_PROXY_ORIGIN, else FRONTEND_URL's scheme and host on
 * BROWSER_PROXY_PORT.
 */
export function browserProxyOriginOf(env: {
  FRONTEND_URL: string;
  BROWSER_PROXY_PORT?: number;
  BROWSER_PROXY_ORIGIN?: string;
}): string | null {
  if (env.BROWSER_PROXY_PORT === undefined) return null;
  if (env.BROWSER_PROXY_ORIGIN) return new URL(env.BROWSER_PROXY_ORIGIN).origin;
  const frontend = new URL(env.FRONTEND_URL);
  return `${frontend.protocol}//${frontend.hostname}:${env.BROWSER_PROXY_PORT}`;
}

/** Which identity this process runs: the estate's Ward, or its own local sign-in. */
export type IdentityMode = 'ward' | 'local';

export function identityModeOf(env: {
  WARD_PUBLIC_ORIGIN?: string;
}): IdentityMode {
  return env.WARD_PUBLIC_ORIGIN ? 'ward' : 'local';
}

export type Env = z.infer<typeof envSchema>;
