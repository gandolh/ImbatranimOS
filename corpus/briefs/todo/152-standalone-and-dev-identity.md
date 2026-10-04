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
