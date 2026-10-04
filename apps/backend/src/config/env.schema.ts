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
  });

/** Which identity this process runs: the estate's Ward, or its own local sign-in. */
export type IdentityMode = 'ward' | 'local';

export function identityModeOf(env: {
  WARD_PUBLIC_ORIGIN?: string;
}): IdentityMode {
  return env.WARD_PUBLIC_ORIGIN ? 'ward' : 'local';
}

export type Env = z.infer<typeof envSchema>;
