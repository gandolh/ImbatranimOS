/**
 * The environment a child process starts with: the backend's own, minus Ward's.
 *
 * `WARD_APP_KEY` is a secret the config schema says never leaves the server.
 * A terminal inheriting `process.env` handed it to anyone with a shell
 * (`echo $WARD_APP_KEY`, brief 138), and git did the same less directly: a
 * repository opened in the Git app runs its own hooks, `core.pager`,
 * `core.fsmonitor` and credential helpers, any of which can read the
 * environment. Every `WARD_*` name goes, not just the key: none of them is a
 * child's business.
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
    if (!name.startsWith('WARD_')) out[name] = value;
  }
  return out;
}
