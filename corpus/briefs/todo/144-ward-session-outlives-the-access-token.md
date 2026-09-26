# Brief 144 — The Ward session outlives its 15-minute access token

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM · CORE
(`apps/core/src/lib/axios.ts`, `lib/prefs.ts`, `modules/auth/*`). **Depends on
brief 137** — nothing can be verified until sign-in works. Brief 145 depends
on this one. Grill step 3 (the proactive timer) before building.

## Context

Ward's access token and its `ward_session` cookie live **15 minutes**
(`wzd_auth/api/src/tokens/claims.ts:48`, `ACCESS_TOKEN_TTL_SECONDS = 15 * 60`;
the cookie's `Max-Age` is the same, `wzd_auth/api/src/auth/cookie.ts`).
Renewal is `POST /ward-api/refresh`, authenticated by the `ward_refresh` cookie
scoped to `Path=/ward-api/refresh` (30 days, rotated on every use). Ward's
decision record says the TTL "only bounds how often the refresh endpoint is
hit" (`wzd_auth/corpus/wiki/decisions-tokens.md`) — clients are expected to
refresh. Only Ward's own UI does (`wzd_auth/ui/src/lib/api.ts`,
`self-service.ts`).

imbatranimOS never refreshes: nothing in `apps/core`, `apps/add-ons` or
`packages/ui` references `/ward-api/refresh`. `apps/core/src/lib/axios.ts:14-22`
turns any 401 into `auth:unauthorized`; `AuthGate.tsx:88-92` covers the desktop
with `SignedOutScreen`. The only way back is a full navigation to Ward's login
page, which has no silent-refresh path (its only effect is autofocus). So the
user retypes their password (and TOTP) and returns to a **fresh page load**:
terminals, unsaved buffers and window layout are gone. Every 15 minutes. That
defeats the brief-101 overlay model the gate was built around.

`system.http` **is** core's axios instance (`createSystemHandle.ts:181`), so
one interceptor covers every add-on's HTTP. The only raw `fetch` callers are
`prefs.ts:276` (the keepalive flush on `pagehide`) and the Terminal's
`usePtyConnection.ts:123`.

## Files you OWN

- `apps/core/src/lib/axios.ts`, a new `apps/core/src/lib/wardSession.ts` with
  tests, `apps/core/src/lib/prefs.ts` (the 401 path only),
  `apps/core/src/modules/auth/store/authStore.ts`, `AuthGate.tsx`

## Files you must NOT touch

- `apps/backend/**` — refresh is Ward's endpoint, and the backend's 401 is
  correct.
- `apps/add-ons/**`.

## What to do

1. `refreshWardSession()`: a single-flight
   `fetch('/ward-api/refresh', { method: 'POST', credentials: 'include' })` —
   one in-flight promise shared by every caller. Resolve `true` on 2xx and
   `false` on 401/403 (the refresh family is dead); throw on a network error
   or 5xx, so an unreachable Ward keeps today's `unavailable` handling rather
   than reading as signed out. The path is origin-absolute (`/ward-api/…`),
   not under `VITE_API_URL`.
2. The axios response interceptor: on a 401 from a request that has not
   already been retried, await `refreshWardSession()`. On `true`, retry the
   original request once; on `false`, dispatch `auth:unauthorized` as today.
   Remove the dead `!url.includes('/auth/')` exclusion — no `/auth/*` routes
   exist since the cutover.
3. Proactive refresh (grill): refreshing about a minute before expiry, and on
   `visibilitychange` to visible, avoids any user-visible 401 and keeps the
   cookie fresh for brief 145. The browser cannot read the HttpOnly cookie's
   expiry, so schedule from "last successful sign-in or refresh + 14 minutes".
   Recommended; it is about 20 lines.
4. `prefs.ts`: brief 109's 401 hold already re-flushes on re-authentication;
   make sure a successful refresh triggers the same re-flush.
5. Local development has no `/ward-api` and the refresh answers 404: treat that
   as "cannot refresh" (signed out), and leave a development identity to brief
   152.

## Must preserve

- Brief 109's dotfile durability (a write held back by a 401 lands after
  re-authentication); the `unavailable` versus signed-out split; the overlay
  model (losing the session covers the desktop, never unmounts it).
- Never retry a request more than once; never refresh in a loop on a 401 from
  `/ward-api/refresh` itself.

## Acceptance

- Unit tests for `refreshWardSession` (10 concurrent 401s → one refresh call)
  and the interceptor (401 → refresh → one retry → success; refresh 401 →
  `auth:unauthorized`; refresh network error → no sign-out event).
- In the browser against a real Ward: sign in, leave the desktop idle for 20
  minutes with an unsaved Notepad buffer, then use it — no sign-in cover, and
  the buffer is intact. (An open Terminal survives only once brief 145 lands;
  say so if you test before it.)
- Core vitest, typecheck and lint green.

## Out of scope

- The Terminal WebSocket's revocation sweep — brief 145.
- Ward's `integrating.md` does not mention that clients must refresh. Worth
  raising in the Ward repo; not this brief.
