# Brief 152 — Decide the standalone and local-development identity story

> **Decided 2026-10-04 by the owner: option C** (restore a single-user local sign-in when `WARD_*` is unset), recorded in [decisions-estate-era.md](../../wiki/decisions-estate-era.md). The grill this brief asked for is done; it is now a build brief. The ISO half changes too: there is no kiosk any more, the ISO is a LAN server OS reached over HTTPS.

Status: **todo** · From the 2026-09-26 improvements sweep. **GRILL FIRST** —
the code now contradicts a locked decision (the friend-run bar). HARD if option
C is chosen, MEDIUM otherwise · BACKEND + CORE + `infrastructure/` + `iso/` +
`corpus/wiki/decisions.md`. Brief 153 is written from this brief's outcome.

## Context

Since the cutover the backend refuses to boot without `WARD_PUBLIC_ORIGIN`,
`WARD_API_BASE_PATH` and `WARD_APP_KEY` (`apps/backend/src/config/env.schema.ts`:
required, no defaults; `config.module.ts` throws "Invalid environment
variables"). Each consequence below was verified:

- **The README's quick start crashes at boot.** `docker compose -f
  infrastructure/docker-compose.yml up imbatranimos` and `docker run -p
  8080:8080 …` set none of the three; the Dockerfile's `prod` stage sets only
  `NODE_ENV`, `PORT`, `STATIC_ROOT`, `FRONTEND_URL`, `DB_PATH`, `NOTES_DIR`,
  `CONFIGS_DIR` and `IMAGE_VERSION`. The (currently uncommitted) comment in
  `infrastructure/docker-compose.yml` says `required: false` on `env_file`
  "keeps the standalone run in the README working … The app's own defaults
  cover everything except Ward, which a local run does not use." It does not:
  a run without the file dies at config validation.
- **Even with the variables set, nobody can sign in outside the estate.** The
  frontend sends people to `/ward/login` on its own origin; locally nothing
  serves it, and there is no `ward_session` cookie for `localhost`. There is no
  development or local identity path — `FakeWardService` exists only in the
  test harness. So `npm run dev` and `dev:local` cannot reach the desktop, which
  is also why the cutover was never tested in a browser.
- **The kiosk ISO cannot start its backend.**
  `iso/scripts/rootfs/etc/init.d/imbatranim-backend:18-25` exports no `WARD_*`,
  and the appliance is designed to run offline against a local backend, where
  no Ward exists.
- **This contradicts locked decisions that were never revisited:** the
  friend-run bar ("a friend with Docker runs one documented command, logs in,
  and uses terminal/files/notes unaided" — `decisions-iso-era.md`,
  `overview.md`); "Security: … Single user; sessions + strong password,
  optional TOTP" (`decisions-pivot-era.md`); and the kiosk ISO as a post-v1
  artifact. The Ward move is recorded in `log.md` (2026-09-06) but has no
  `decisions.md` entry, and `corpus/CLAUDE.md` requires "an explicit revisit +
  a `log.md` entry" to change a locked decision.

## Options (for the grill)

- **A. Estate-only.** Record that imbatranimOS runs only inside a Ward estate;
  retire or park the friend-run bar and the kiosk ISO in `decisions.md`; the
  README says so plainly. Cheapest; gives up the product's stated finish line.
- **B. A development identity only.** `WARD_DEV_IDENTITY=<username>`, accepted
  only when `NODE_ENV !== 'production'` and the server listens on loopback.
  The REST guard and the WebSocket upgrade then treat every request as that
  user holding an `imbatranim-os` grant, `/api/me` answers accordingly, the
  schema relaxes the three `WARD_*` in that mode, and the boot log says so
  loudly. Unblocks `npm run dev` and browser verification of every other brief;
  does nothing for friends or the ISO.
- **C. A local identity provider.** When `WARD_*` are unset, a single-user local
  sign-in behind the same `WardCaller`-shaped seam. The deleted `AuthModule`
  (argon2id, httpOnly cookie, first-run wizard, TOTP, throttle) is recoverable
  from `fb3de23^` — about 1,200 lines plus tests. Restores the friend-run bar
  and the ISO; doubles the authentication surface to maintain and review.
- **D. Run Ward locally** in the compose dev profile (wzd_auth has its own
  infrastructure). Real, but ties this repo's dev loop to another repo's
  checkout.

**Recommendation:** B now — it is small and unblocks browser verification of
briefs 137, 144 and 145 — and decide A versus C for the friend-run bar
explicitly, recording the outcome as a `decisions.md` revisit either way.

## Files you OWN

Depends on the option chosen: `apps/backend/src/config/env.schema.ts`,
`apps/backend/src/modules/ward/*`, `apps/core/src/modules/auth/*`,
`infrastructure/docker-compose.yml` (the dev profile's environment),
`iso/scripts/rootfs/etc/init.d/imbatranim-backend`,
`corpus/wiki/decisions.md`.

## Files you must NOT touch

- Anything briefs 137, 144, 145 and 146 own, until they have landed.
- `README.md` and the infrastructure docs — brief 153 writes them from this
  brief's outcome.

## Acceptance (for B; extend for A or C)

- `npm run dev` → the desktop loads in a browser at `http://localhost:5173`,
  signed in as the development identity with a visible marker saying so, and
  the Terminal opens.
- The same variable with `NODE_ENV=production`, or with a non-loopback bind,
  refuses to boot with a message naming the variable.
- A `decisions.md` entry, dated the day of the grill, records the Ward move
  (why, the alternatives rejected, the consequences: lock → cover screen, a
  restore no longer revokes sessions) and the friend-run-bar outcome.

## Outcome (2026-10-04)

**Option C, decided by the owner** ([decisions-estate-era.md](../../wiki/decisions-estate-era.md),
which also records the 2026-09-06 Ward move as a decision at last). Built
lean rather than restored from `fb3de23^`.

- **Mode.** `WARD_*` became optional, all three or none: setting only some is
  refused at boot with a message naming them. With none, `WardService` hands
  every request to `LocalIdentityService` through the same `authenticate`. The
  guard, `/api/me`, the freshness registry and the PTY upgrade need no second
  path. The boot log warns loudly that local mode is on.
- **`modules/local-identity/`:**
  - **Storage:** a single `local_owner` row and `local_session`, in ledger
    step 8, with new names; step 7 still drops the pre-Ward tables.
  - **Passwords:** scrypt (`node:crypto`, `N=2^15`), so no native module.
  - **Sessions:** an `imb_session` httpOnly, SameSite=Lax cookie lasting 30
    days, with only its SHA-256 stored.
  - **Backoff:** per address, five free failures, then doubling from 1 s to
    15 min.
  - **First claim:** `SETUP_TOKEN` gates it, with a constant-time compare.
  - **Routes:** `GET /api/identity` (public), `POST
    /api/identity/local/{setup,sign-in,sign-out,password}`. The local routes
    are 404 in Ward mode.
  - **The `Secure` flag:** set from `req.secure` or `X-Forwarded-Proto`,
    because `TRUST_PROXY` must stay off behind Caddy.
- **A restore revokes local sessions again** (`BackupService.installDatabase`):
  the restored database brings the backup's owner and password.
- **Desktop:**
  - `getIdentity()` beside `/me`; the signed-out screen becomes "Set up this
    machine" (name, password ×2, the token when required) or "Sign in".
  - Log off and the cover's "Sign out instead" call the local sign-out.
  - Settings → Security has a change-password form.
  - Ward's proactive refresh runs only in Ward mode.
- **Not built:** option B's development identity. Local dev can run in local
  mode now, or against the local Ward container (option D, already in place).
  TOTP is not part of the local sign-in.
- **The ISO half is redirected:** the kiosk is dropped
  ([brief 18](../superseded/18-alpine-kiosk-iso.md) superseded), and the
  server ISO needs its own brief. With no `WARD_*`, its backend now boots into
  the local sign-in.

**Tests:**
- Unit: scrypt and throttle; the db ledger at version 8 with both tables; a
  restore ending a local session, with the backup's password working again
  (fails without the revoke).
- e2e `local-identity.e2e-spec.ts` (8): unclaimed, setup once, sign-in,
  `/me`, sign-out, 429 after the free misses, password change keeping this
  session only, the Secure flag behind a proxy, the setup token, Ward mode's
  404s.
- Core: AuthGate shows setup with the token field, and sign-in submits and
  reaches the desktop.
- Repo: typecheck, `format:check`, 30/30 test tasks, backend e2e 132.
- **Browser walk** (built backend from a scratch dir, no `WARD_*`,
  `SETUP_TOKEN` set):
  - claimed with the token;
  - the desktop loaded and the Terminal ran `echo $((6*7))` with
    `$WARD_APP_KEY` empty;
  - Log off made `/me` 401 and showed Sign in;
  - a wrong password showed "Wrong password", and the right one brought the
    desktop back.
- **Container:** `imbatranimos:1.0` run with no environment at all, as the
  README says. It booted into local mode (`/api/identity` →
  `{mode: local, setUp: false}`), `/api/me` was 401 and the desktop was served.
  Before this brief it died at config validation.
