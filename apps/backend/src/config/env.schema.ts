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
  // --- Auth (Brief 10) ---------------------------------------------------
  // Marks the session cookie Secure. Leave false for plain-HTTP LAN use;
  // set true when a TLS-terminating reverse proxy (or built-in HTTPS) fronts
  // the app, otherwise browsers drop the cookie over http://.
  COOKIE_SECURE: envBool(false),
  // Trust X-Forwarded-* from a front proxy so req.ip / protocol are real
  // (needed for correct rate-limit keying and secure-cookie behaviour behind
  // Caddy/nginx). Keep false when exposed directly.
  TRUST_PROXY: envBool(false),
  // Session lifetime; sliding — validation refreshes last_seen but not expiry.
  SESSION_TTL_HOURS: z.coerce.number().default(168), // 7 days
});

export type Env = z.infer<typeof envSchema>;
