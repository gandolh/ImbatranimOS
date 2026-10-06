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
