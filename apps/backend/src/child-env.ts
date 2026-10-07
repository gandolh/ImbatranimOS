import { IGNORED_ENV_PREFIX } from './config/env.schema';

/** Secrets the config schema says never leave the server. */
const SECRET_NAMES = new Set(['SETUP_TOKEN']);

/**
 * The environment a child process starts with: the backend's own, minus its
 * secrets.
 *
 * A terminal inheriting `process.env` hands every secret in it to anyone with
 * a shell (`echo $NAME`, brief 138), and git does the same less directly: a
 * repository opened in the Git app runs its own hooks, `core.pager`,
 * `core.fsmonitor` and credential helpers, any of which can read the
 * environment. So `SETUP_TOKEN` goes, and so does every ignored `WARD_*` name
 * an old `.env` may still carry (one was a key).
 *
 * A denylist rather than an allowlist on purpose. The terminal is the user's
 * workspace on a real system, and an allowlist would also strip whatever the
 * image or the operator set for them (`EDITOR`, locale, tool paths). The cost
 * is that a future secret must be added here; the schema marks each one.
 *
 * A copy: `process.env` itself is never touched. Every spawn site uses this:
 * the terminal, git, and tar in backup and archive.
 */
export function childEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_NAMES.has(name) || name.startsWith(IGNORED_ENV_PREFIX)) continue;
    out[name] = value;
  }
  return out;
}
