# Brief 145 — Open terminals survive access-token rotation

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM · BACKEND
(`apps/backend/src/modules/pty/pty.gateway.ts`, a small new provider under
`modules/ward/`). **Depends on brief 144** (the browser must be rotating its
token) **and brief 138** (same file). Grill the design choice below.

## Context

The PTY gateway stores the cookie header it saw **at upgrade time**
(`pty.gateway.ts:164`, `cookie: req.headers.cookie`) and every 30 s
(`REVOKE_SWEEP_MS`, `:36`) re-runs `authorizeUpgrade` against that stored
cookie (`sweepRevoked`, `:190-202`). `authorizeUpgrade` → `ward.authenticate`
→ `jwtVerify`, which checks `exp` with a 5 s tolerance. Ward access tokens
expire after 15 minutes, so **every terminal is closed with 4401
`session-revoked` within 15 minutes of the token it opened with being
minted** — even while the user is signed in and, once brief 144 lands, their
browser holds a fresh cookie. A WebSocket cannot receive the new cookie. The
Terminal then shows "Session ended", and whatever was running in it is gone.

Under the old sliding `imb_session` (up to 30 days), storing the upgrade
cookie was safe; with 15-minute tokens it is not. Introspection cannot help
with an expired token: Ward answers `active: false` for expired, revoked and
unknown tokens alike.

There is no `pty.gateway.spec.ts`: the sweep, the session cap and the
spawn-failure path have no tests (`pty-upgrade.spec.ts` covers only the
handshake). Brief 138 creates the file; extend it.

## Files you OWN

- `apps/backend/src/modules/pty/pty.gateway.ts` — live-session bookkeeping and
  `sweepRevoked`; `pty.gateway.spec.ts`
- `apps/backend/src/modules/ward/` — a new small provider (e.g.
  `ward-freshness.ts`) and the one call in `ward.guard.ts` that feeds it

## Files you must NOT touch

- The upgrade handler's error, 404 and environment handling (brief 138);
  `ward.client.ts` (brief 146).

## What to do (recommended — confirm in the grill)

1. A process-local **freshness registry** keyed by Ward `sid` (`WardCaller.sid`
   is already carried): `note(sid, cookieHeader)` keeps the latest cookie that
   authenticated successfully, with a timestamp.
2. `WardAuthGuard` calls `note(req.ward.sid, req.headers.cookie)` after a
   successful grant check. The desktop makes authenticated requests at least
   every 60 s (the tray's `refetchInterval: 60_000`, `Tray.tsx:132`) plus every
   other API call, so the registry tracks the browser's rotating token.
3. PTY entries record their `sid`; `sweepRevoked` authorizes with the
   registry's latest cookie for that `sid`, falling back to the stored one.
   Resulting semantics: a terminal lives exactly as long as a tab signed into
   that Ward session keeps talking to this backend, while revocation, grant
   removal and logout still close it within one sweep plus the 30 s
   introspection window.
4. Evict registry entries that have no live PTY and are older than the token
   TTL.

Alternative considered: a Terminal-driven `POST /api/pty/heartbeat`. Same
effect, but only the Terminal add-on keeps it fresh, and it adds a route.

## Must preserve

- A revoked session or a removed grant still closes open shells — the property
  the cutover commit calls out. The sweep never extends a Ward session; it
  only reads.
- `MAX_SESSIONS`, backpressure, idempotent `dispose`.

## Acceptance

- `pty.gateway.spec.ts` with fake timers and a fake `WardService`:
  (a) token A expires while the registry holds token B for the same `sid` →
  the shell stays open; (b) Ward reports the `sid` inactive → closed with
  4401; (c) grant removed → closed; (d) no fresh cookie after expiry → closed;
  (e) the session cap rejects the shell over `MAX_SESSIONS`; (f) a spawn
  failure closes with 1011.
- In the browser against a real Ward: a Terminal running
  `while true; do date; sleep 30; done` keeps printing for 40 minutes, and
  signing out at Ward closes it within about a minute.

## Outcome (2026-10-03)

Done with the recommended design, a freshness registry. **The grill did not happen**; the heartbeat alternative stays rejected for the brief's reasons.

- **`modules/ward/ward-freshness.ts` (new, `WardFreshness`):**
  - `note(sid, cookie)`, `latest(sid)`, and `evict(keep)`, which drops entries with no live shell once older than the 15-minute token lifetime.
  - It is provided and exported by `WardModule`, and by `WardTestModule` in `testing.ts`.
- `WardAuthGuard` calls `note(session.sid, req.headers.cookie)` after the grant check passes.
- **`pty.gateway.ts`:** each live shell records its `sid`. `sweepRevoked` asks Ward with `freshness.latest(sid) ?? entry.cookie`, keeps whichever cookie worked as the shell's fallback, and evicts at the end of each sweep.
  - The upgrade handler from brief 138 is untouched.
  - The sweep only chooses which cookie to ask with, so it still never extends a session.

**Tests** (`pty.gateway.spec.ts`, against a fake Ward keyed by cookie; the sweep is called directly, because fake timers would also freeze `ws` and the PTY session):
- (a) token A expired, registry has B → still open;
- (b) Ward says inactive → 4401;
- (c) grant removed → 4401;
- (d) expired with nothing fresher → 4401;
- (e) the 13th shell → 503;
- (f) `pty.spawn` throws → 1011;
- eviction drops an old session with no shell and keeps a recent one.
- (a) and eviction fail on the old sweep.
- `ward-session.e2e-spec.ts` asserts the guard records a cookie only when it passes: not on a 403, and once on a 200.
- Backend unit 419/419, e2e 122/122.

**Browser check against the local Ward container** (dev backend on scratch roots, `while true; do date +TICK-…; sleep 30; done`):
- **First run (17:30): the shell closed before 17:48, a real gap.** After a page load, the desktop's first proactive refresh (brief 144) was scheduled from load time + 14 minutes, later than the true expiry of a token minted a minute before the load. Until the next request carried the new cookie, the sweep had only the expired one, which is case (d) by timing. Two more gaps had the same shape: the timer skipped hidden tabs, and a hidden tab makes no other request.
  - Fixed on the desktop side: refresh once on sign-in, refresh two minutes ahead and in hidden tabs, and re-probe `/me` after every refresh so the guard records the new cookie at once.
- **Second run (17:48–18:35): 47 minutes** in the same terminal element, about three token lifetimes, ticking through the idle screensaver (`textContent`, because the cover sets `visibility: hidden`).
- **Revocation:** ending that session in Ward's console at 18:38:39 stopped the ticks within one sweep (the last was 18:38:30), and the desktop showed the sign-in cover by +45 s.
  - Ward's own **Sign out** (`POST /ward-api/logout` 204) revoked nothing, and the shell kept ticking. That is the known Ward bug (the refresh cookie is scoped to `/ward-api/refresh` and never reaches `/logout`), not this brief.
