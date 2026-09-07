import { z } from 'zod';

// Env booleans arrive as strings ("true"/"1"). Coerce leniently; unset -> default.
const envBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? def : v === 'true' || v === '1',
    );

export const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DB_PATH: z.string().default('../../data/db.sqlite'),
  NOTES_DIR: z.string().default('../../data/notes'),
  CONFIGS_DIR: z.string().default('../../data/configs'),
  // When set (prod image), Nest serves the built frontend from this dir on
  // the same port as the API. Unset in dev — Vite serves the frontend.
  STATIC_ROOT: z.string().optional(),
  // --- Ward (the estate's identity service) -----------------------------
  //
  // imbatranimOS authenticates nobody. Identity is Ward's: the browser holds a
  // `ward_session` cookie for the whole origin, verified locally against Ward's
  // JWKS and then introspected for liveness. There is no account here, no
  // password hash and no session store.
  //
  // All three are REQUIRED and none has a default. A missing one is a total
  // outage rather than a degraded mode — Ward refuses every unkeyed
  // introspection, so every guarded route would 503 — and this schema is
  // validated at bootstrap, so it fails before the server listens.

  // Ward's public origin, and the exact `iss` on every access token.
  WARD_PUBLIC_ORIGIN: z.string().url(),
  // Ward's prefix behind Caddy: `/ward-api`.
  //
  // Deliberately undefaulted. An empty value resolves the JWKS to
  // `<origin>/.well-known/jwks.json`, a path nothing serves — which would make
  // this app reject every token, with a clean log, on the deploy that carried
  // the mistake.
  WARD_API_BASE_PATH: z.string().min(1),
  // This app's own Ward service key, sent as `x-ward-app-key`. A SECRET:
  // server-side only, never logged in full, never exposed to the frontend.
  // Issued from Ward's console, shown once, not readable back.
  WARD_APP_KEY: z.string().min(1),

  // Trust X-Forwarded-* from a front proxy so req.ip / protocol are real
  // (needed for correct secure-cookie behaviour behind Caddy/nginx). Keep
  // false when exposed directly.
  TRUST_PROXY: envBool(false),
});

export type Env = z.infer<typeof envSchema>;
