# Task 157 — Drop Ward: the desktop signs in on its own, in the estate too

## Context

Decided by the owner on 2026-10-06, answering the open question "same-origin
exposure inside the estate". Two answers in one:

1. **Staying on the shared domain is accepted.** `gandolh.ro/imbatranim-os`
   stays where it is. No subdomain.
2. **ImbatranimOS drops Ward and keeps its own sign-in everywhere.** Brief 152
   already built a single-owner local sign-in (argon2id password, `imb_session`
   cookie, first-run claim guarded by `SETUP_TOKEN`, backoff) for when the
   `WARD_*` variables are unset. From now on that is the only identity path,
   in the estate as well as standalone and on the ISO.

**What this does and does not change about the risk.** Ward's estate-wide
cookie no longer opens the desktop, so being signed in to a sibling app is no
longer being signed in to a shell. A same-origin script on a sibling app can
still send requests to `/imbatranim-os/api/*`, and the browser still attaches
`imb_session` to them, so an XSS on a sibling app while the owner is signed in
to the desktop still reaches the terminal. The owner accepted that on
2026-10-06: every app on the origin is the owner's own code under
`script-src 'self'`. Record it as an accepted risk, not as a fix.

## Files you OWN

- `apps/backend/src/modules/ward/` (delete), `apps/backend/src/app.module.ts`,
  `apps/backend/src/config/env.schema.ts`, `apps/backend/src/modules/auth/ws-auth.ts`
  and every guard or controller that branches on Ward vs local
- `apps/backend/src/modules/local-identity/`: keep, rename types that still
  carry the Ward name (`WardCaller`, `WardAuthenticationError`,
  `IMBATRANIMOS_APP_SLUG` in `ward.types.ts`) into an identity module
- `apps/core/src/modules/auth/` (`AuthGate`, `SessionScreens`, `LocalScreens`,
  `AuthShell`, `authStore`, `authApi`), `apps/core/src/lib/axios.ts`, and the
  Ward mentions in `Settings.tsx`, `BackupSettings.tsx`, the Alt-Tab switcher
  (`switcherModel.ts`, `AltTabSwitcher.tsx`) and `packages/ui/src/system.ts`
- `apps/core/vite.config.ts` (the dev `/ward` proxy), `README.md`,
  `infrastructure/`
- In `../vps-deploy`: `stacks/imbatranim-os.ts` (`useWard` goes) and the
  `imbatranimOs.useWard(...)` line in `app.ts`; the stack gains a
  `SETUP_TOKEN` secret instead
- In `../wzd_auth`: the `"imbatranim-os"` row in
  `api/src/scripts/register-app-keys.ts` and in `ui/src/lib/estate.ts` (and
  their tests)
- Corpus: `wiki/decisions-estate-era.md`, `wiki/open-questions.md`,
  `wiki/architecture.md`, `wiki/overview.md`, `wiki/status.md`, `log.md`

## Files you must NOT touch

- The Browser proxy's separate origin (brief 50). It stays exactly as it is.
- The marketplace (brief 120) beyond renaming types it imports.

## What to do

1. Backend: delete the Ward module and the three `WARD_*` variables. The
   local sign-in is always on. Keep `SETUP_TOKEN` exactly as it works now.
   A boot with `WARD_*` still set logs one line saying they are ignored, so an
   old `.env` does not fail silently.
2. Core: remove the Ward sign-in branch. Any "Signed in through Ward" text,
   links to Ward's account page, and the Ward-backed switcher entries go. The
   Alt-Tab switcher's estate list either loses its Ward source or reads a
   static list; pick the smaller change and say which.
3. vps-deploy: stop calling `useWard` for this stack and delete the method.
   Pass `SETUP_TOKEN` as a secret `EnvValue`, the way other stacks pass
   secrets. Do not deploy; the owner deploys.
4. Ward: remove `imbatranim-os` from the app-key registration script and from
   the estate launcher list. Ward's database still holds the app row and its
   grants; write the owner's one-line cleanup step in the outcome, do not run
   it against production.
5. Corpus: a decisions entry ("ImbatranimOS keeps its own sign-in, in the
   estate too", revising the estate-era Ward entry), the accepted same-origin
   risk worded as above, the open question deleted, and a log entry.

## Owner steps (after the deploy)

- Read `SETUP_TOKEN` from the deploy's secret store, open
  `gandolh.ro/imbatranim-os`, claim the machine with it and a new password.
- Remove the `imbatranim-os` app from Ward's console.

## Acceptance

- `grep -ri ward apps packages infrastructure` finds nothing but the ignore
  notice and history comments you chose to keep.
- With no `WARD_*` set, `npm run dev` reaches the first-run claim, then the
  desktop; the terminal opens; sign-out returns to the sign-in screen.
- The backend and core test suites and `npm run typecheck` pass.
- vps-deploy's dry run for `imbatranim-os` shows `SETUP_TOKEN` and no `WARD_*`.
- Ward's own tests pass with the row removed.

## Outcome (2026-10-07)

Done as written, in three repos.

- **imbatranimOS** (`97de425`, 1.1.0): the `ward` module, its token client,
  the `jose` dependency, the three `WARD_*` variables, the desktop's token
  refresh and the terminal's freshness registry are gone. A new `identity`
  module holds the global `SessionGuard`, `/api/me`, `Caller` and
  `AuthenticationError`; `local-identity` keeps the sign-in. The terminal, the
  Browser relay and the marketplace sockets check the upgrade's own cookie,
  which no longer rotates. A boot with `WARD_*` still set logs one line naming
  them as ignored. Child processes lose `SETUP_TOKEN` and any `WARD_*`.
- **vps-deploy** (`93c1772`): `useWard` and the stack's `app` field are gone,
  so imbatranim-os no longer depends on ward. The stack passes `SETUP_TOKEN`
  as a required secret from `secrets/imbatranim-os.env`; a deploy without one
  stops before the upload. The env-file write now names its keys, never the
  values: the dry run shows `keys: SETUP_TOKEN` and no `WARD_*`.
- **wzd_auth** (`3c1d9e6`): no `imbatranim-os` row in `register-app-keys`, in
  `ESTATE_APPS` (so it is no longer a `?next=` destination) or in the local
  seed, which also stops writing `WARD_*` into this repo's env files.

**Alt-Tab switcher: no change, the smaller option.** It lists open windows
only and never had a Ward source or an estate list; the brief's premise came
from the word "backwards" matching the grep.

`grep -ri ward` over `apps packages infrastructure` now finds only the ignore
notice (`env.schema.ts`, `child-env.ts`), its tests and the README line about
it, plus words like "forward" and the untracked local `apps/backend/.env`.

Checks: backend 524 unit and 143 e2e tests, core 298, Ward 946, root
`npm run typecheck` (31 tasks), vps-deploy typecheck and `--check`. Walked in
the dev container with a fresh volume and no `WARD_*`: the first-run claim,
then the desktop, a live terminal (`whoami` is `imbatranim`), Log off back to
the sign-in form, a wrong password refused in the form, and signing in again.

Owner steps, after the deploy:

1. Add `SETUP_TOKEN` to vps-deploy's `secrets/imbatranim-os.env`
   (`openssl rand -base64 32`). `WARD_APP_KEY` there is unused now.
2. Deploy imbatranim-os, open `gandolh.ro/imbatranim-os` and claim the machine
   with the token and a new password.
3. Ward cleanup, one line: in Ward's console open Apps, then imbatranim-os, then
   Delete app. That cascades its grants and service keys.
