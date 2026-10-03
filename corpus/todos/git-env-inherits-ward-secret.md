# The Git app's child processes inherit `WARD_APP_KEY`

Captured 2026-10-03 while closing [brief 138](../briefs/done/138-pty-upgrade-handler-hardening.md),
which scrubbed Ward's secret from terminals and assumed the git module already did.

It does not. `apps/backend/src/modules/git/git.service.ts` runs git through execa
with `env: GIT_ENV` **and `extendEnv: true`**, so git gets all of `process.env`
plus three settings. `GIT_ENV` hardens git's behaviour; it never removed anything.
Git runs hooks, `core.pager`, `core.fsmonitor` and credential helpers from the
repository's own config, so a repository the user opens in the Git app can run a
command that reads `WARD_APP_KEY`. Brief 138's terminal fix closes the direct
route (`echo $WARD_APP_KEY` in a shell). This is the indirect one.

The likely fix is the same `shellEnv` copy brief 138 added to `pty.gateway.ts`,
moved somewhere both modules can import it, with `extendEnv: false`. It needs a
test that a hook sees no `WARD_*` names. Check whether archive-manager or any
other spawn site does the same before writing the brief.
