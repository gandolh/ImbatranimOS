# Brief 137 — Ward sign-in actually reaches the desktop

Status: **todo** · From the 2026-09-26 improvements sweep; every claim below was
re-read against the code. MEDIUM · BACKEND + CORE + one line in an add-on
(`modules/ward/`, `modules/auth/`, `repl-interpreter/usePtyConnection.ts`).
**Blocks briefs 144 and 145.** 1–2 chunks → implement inline.

## Context

The 2026-09-06 cutover to Ward (commit `fb3de23`) was verified by unit and e2e
suites that swap in a fake Ward. Its own log entry says "nothing has been run
against a real browser or a deployed Ward." Read end to end, the sign-in path
cannot work in the deployed estate. Five independent defects; each of the first
four alone keeps a legitimate user off the desktop.

1. **No backend route serves `GET /api/me`.**
   `apps/core/src/modules/auth/api/authApi.ts:50` probes the session with
   `api.get('/me')`. The backend's 16 controllers are `archive`, `http`,
   `sticky-notes`, `files`, `files/recent`, `files/trash`, `bookmarks`, `logs`,
   `prefs`, `calendar`, `system`, `clock`, `todos`, `git`, `backup`,
   `schedule` — no `me`. The old public `GET /auth/status` was deleted with
   `AuthModule`. Every probe 404s; `getStatus` (`authApi.ts:48-61`) maps
   everything except 503 to `{ authenticated: false }`; `AuthGate.tsx:112`
   renders `SignedOutScreen` for a user with a live, granted Ward session. They
   go to Ward, sign in, come back, 404 again.
2. **The grant is looked up under the wrong slug.**
   `apps/backend/src/modules/ward/ward.types.ts:52` —
   `IMBATRANIMOS_APP_SLUG = 'imbatranimos'`, used by the REST guard
   (`ward.guard.ts:121`) and the WebSocket upgrade (`pty-upgrade.ts:67`). Ward
   registers this app as **`imbatranim-os`**:
   `wzd_auth/ui/src/lib/estate.ts:59` (`{ slug: "imbatranim-os", root:
   "imbatranim-os" }`) and `wzd_auth/api/src/scripts/register-app-keys.ts`
   (slug = the vps-deploy stack name `imbatranim-os`; there is no
   `SLUG_FOR_STACK` mapping for it; display name at `:58`). Grants are keyed by
   slug, so `grants['imbatranimos']` is always undefined and, once #1 is fixed,
   every request 403s. Ward's own `api/src/db/test-support.ts:39` seeds
   `imbatranimos` — Ward is internally inconsistent, which is probably where
   the wrong value came from.
3. **After sign-in Ward cannot send the user back.** `authApi.ts:18` —
   `APP_ROOT = '/os/'` is the default `next` of `wardLoginUrl()` (`:70`). The
   app is served at `/imbatranim-os/` (`vps-deploy/stacks/imbatranim-os.ts:54-55`)
   and Ward's `?next=` allowlist matches exact first segments
   (`estate.ts` `ESTATE_ROOTS`). `/os/` is not an estate root, so Ward drops it
   and lands the user on `/`.
4. **"Signed in but no access" is shown as "signed out", which loops.** The
   guard deliberately answers 403 for a live session without a grant — its
   header says "This must not be a 401: the person is already signed in".
   `getStatus` folds 403 into `authenticated: false`, so the user is offered
   "Continue to sign in". Ward's Login page has no already-signed-in shortcut
   (its only effect is autofocus), so they retype their password, come back,
   get 403, and repeat — never told they need a grant.
5. **The Terminal still calls a deleted route.**
   `apps/add-ons/repl-interpreter/src/hooks/usePtyConnection.ts:120-134`
   (`describeAuthFailure`) fetches `${base}/auth/status` to explain a refused
   handshake. It now 404s, so the diagnosis never runs, and its copy still
   says "unlock the desktop".

Why no test caught it: every e2e suite overrides `WardService` with
`FakeWardService`, no test requests `/api/me`, and the frontend auth flow has
no tests at all.

## Files you OWN

- `apps/backend/src/modules/ward/` — a new `me.controller.ts` (registered in
  `ward.module.ts`) and the slug constant in `ward.types.ts`
- `apps/backend/test/` — a new `ward-session.e2e-spec.ts` (or extend
  `security.e2e-spec.ts`)
- `apps/core/src/modules/auth/api/authApi.ts`, `AuthGate.tsx`,
  `SessionScreens.tsx`, `store/authStore.ts`, and a new test file beside them
- `apps/add-ons/repl-interpreter/src/hooks/usePtyConnection.ts` —
  `describeAuthFailure` only

## Files you must NOT touch

- `apps/core/src/lib/axios.ts` — brief 144 rewrites the interceptor.
- `apps/backend/src/modules/ward/ward.client.ts` — brief 146.
- `apps/backend/src/modules/pty/pty.gateway.ts` — briefs 138 and 145. The slug
  change reaches `pty-upgrade.ts` through its import; no edit needed there.

## What to do

1. **`GET /api/me`.** A `MeController` (`@Controller('me')`, `@Get()`, guarded
   — no `@Public()`) returning `{ user: { subject, username } }` from
   `req.ward`. Keep it narrow: never return `grants`, which is the whole
   estate's map (`authApi.ts:44-46` already argues why). The guard's
   401/403/503 outcomes are unchanged.
2. **The slug.** Before editing, confirm the live value on the Ward host
   (`sqlite3 <WARD_DB_PATH> "select slug from apps"`, or Ward's console).
   Expected: `imbatranim-os`. Set `IMBATRANIMOS_APP_SLUG` to it and keep the
   constant the only place the string lives, with a comment naming
   `wzd_auth/ui/src/lib/estate.ts` as the source of truth. (For the Ward repo,
   not this brief: `test-support.ts:39` should seed the same slug.)
3. **`APP_ROOT` from the build**, not a literal: `import.meta.env.BASE_URL`
   (Vite derives it from `VITE_BASE` — `/imbatranim-os/` in the deploy, `/`
   locally).
4. **403 is its own state.** `getStatus` returns a third shape (for example
   `forbidden: true`); `AuthGate` renders a "This account has no access to
   this system" screen (reuse `AuthShell`) with a link to `wardAccountUrl()`
   for switching account — not the sign-in hand-off. 503 keeps
   `IdentityUnavailableScreen`.
5. **Terminal diagnosis** calls `${base}/me`: 200 → `null` (not an auth
   problem), 401 → "Signed out — sign in again from the desktop.", 403 → "This
   account has no access to this system.", other or thrown → "The backend is
   not reachable." Drop the "unlock" wording.

## Must preserve

- The Origin check runs before the public check; `@Public()` semantics are
  unchanged.
- The browser never receives the grant map.
- 503 is never presented as "signed out" (the `unavailable` split).
- The overlay model: after this tab's first sign-in, losing the session covers
  the desktop instead of unmounting it (`AuthGate` `everAuthenticated`).

## Acceptance

- Backend e2e with the real guard and the fake client (`WardTestModule`):
  `GET /api/me` → 200 `{ user: { subject, username } }` for a granted session,
  with no `grants` key in the body; 401 with no cookie; **403 for a live
  session holding no grant** (Ward's `integrating.md`: "Every integration owes
  a test that asserts exactly this"); 503 when the fake throws
  `WardUnavailableError`.
- A unit test pinning `IMBATRANIMOS_APP_SLUG === 'imbatranim-os'`, so a
  regression is a red test instead of an outage.
- Frontend tests for `getStatus`'s 200/401/403/503 mapping and for which
  screen `AuthGate` renders in each state.
- Typecheck, backend unit + e2e, and core vitest green.
- **Browser check against a real Ward** (the deployed estate, or a local
  wzd_auth): a granted account lands on the desktop at `/imbatranim-os/` after
  Ward's login; a grantless account sees the no-access screen, with no loop; a
  signed-out visitor is sent to Ward and returned to `/imbatranim-os/`. Note
  which Ward was used.

## Out of scope

- Refreshing the 15-minute access token — brief 144. Until it lands, expect the
  desktop to drop to the sign-in cover about 15 minutes after sign-in.
- A standalone or development identity — brief 152.
