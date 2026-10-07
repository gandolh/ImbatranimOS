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
    // --- Identity: the machine's own single-owner sign-in -------------------
    //
    // A password chosen on first run, an httpOnly session cookie and a login
    // throttle (brief 152). It is the only sign-in since brief 157.
    //
    // When set, the first-run claim needs this token as well as a new password,
    // so a machine reachable on a network cannot be claimed by whoever gets
    // there before its owner. Printed by the operator (or the ISO's first
    // boot), never by the app. Ignored once the machine is claimed. A SECRET:
    // `child-env.ts` keeps it out of every child process.
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

    // --- The app marketplace (brief 120) ------------------------------------
    //
    // The catalog: the repo's `marketplace/` directory, one descriptor per
    // installable app. Only what is described there can be installed.
    MARKETPLACE_DIR: z.string().default('../../marketplace'),
    // Lets a descriptor's repo be a `file://` path. For tests and for trying a
    // game from a local checkout; never needed in production.
    MARKETPLACE_ALLOW_LOCAL_REPOS: envBool(false),

    // Trust X-Forwarded-* from a front proxy so req.ip / protocol are real
    // (needed for correct secure-cookie behaviour behind Caddy/nginx). Keep
    // false when exposed directly.
    TRUST_PROXY: envBool(false),
  })
  .superRefine((env, ctx) => {
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

/**
 * Variables a deploy from before brief 157 still sets, which nothing reads.
 *
 * The estate's identity service once signed people in here through three
 * `WARD_*` variables. An old `.env` that still holds them must not fail
 * silently, so the boot names them once (`main.ts`). `child-env.ts` still keeps
 * them out of child processes, since one of them was a key.
 */
export const IGNORED_ENV_PREFIX = 'WARD_';

/** The boot's one line about ignored variables, or null when there are none. */
export function ignoredEnvNotice(env: NodeJS.ProcessEnv): string | null {
  const names = Object.keys(env)
    .filter((name) => name.startsWith(IGNORED_ENV_PREFIX))
    .sort();
  if (names.length === 0) return null;
  return `Ignoring ${names.join(', ')}: this machine signs people in itself (brief 157). Remove them from the environment.`;
}

export type Env = z.infer<typeof envSchema>;
