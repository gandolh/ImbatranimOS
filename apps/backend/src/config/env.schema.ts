import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DB_PATH: z.string().default('../../data/db.sqlite'),
  NOTES_DIR: z.string().default('../../data/notes'),
  CONFIGS_DIR: z.string().default('../../data/configs'),
  // When set (prod image), Nest serves the built frontend from this dir on
  // the same port as the API. Unset in dev — Vite serves the frontend.
  STATIC_ROOT: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>
