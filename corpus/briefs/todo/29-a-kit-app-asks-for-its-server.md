# Brief 29 — A kit app asks for its server

## Context

Found by imbatranim-office while building DWG opening (2026-10-28). `type`
and `server` belong to the marketplace descriptor
(`apps/backend/src/modules/marketplace/catalog.ts`, schema 2), the lease is
keyed by the descriptor's id (`apps/core/src/modules/marketplace/useServerLease.ts`),
and `KitAppHost` (`apps/core/src/modules/marketplace/KitAppHost.tsx`) leases
before the app renders and throws when the lease fails. CAD's DWG server
made the Office suite a `service`, so all five apps paid for it, measured in
the production image (load 27-32):

| Install | No server running yet | Server already up |
|---|---|---|
| `static` | 1,023-1,152 ms | — |
| `service` | 2,745-5,027 ms, "Starting its server…" shown | 1,083-1,516 ms |

When the server could not start, every Office window showed "Sheets stopped
working", not only CAD's DWG open; and while any Office window was open the
server held one of the four server slots (`MAX_SERVERS`) and about 100 MB.
imbatranim-office has since shipped the suite `static` with DWG opening
turned off.

Decided with the owner on 2026-11-03
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md),
"A kit app asks for its server when it needs one"): the server starts on
demand. Rejected: a per-app `server: true` flag. imbatranim-office's brief
"CAD asks for its server on its first DWG" uses what this one builds.
Promoted from imbatranim-office's todo
`2026-10-28-os-suite-server-for-every-window`.

## Spec

1. **The kit's call.** Add a call to the kit's system handle (in
   `packages/ui/src/system.ts`, next to the other namespaces) that asks for
   the app's server and resolves with what the app needs to reach it (what
   `KitAppHost` hands over today), or rejects with an error the app can
   show. A second call while the server is up reuses the same lease. An app
   whose descriptor has no server gets a rejection that says so.
2. **The host stops leasing first.** `KitAppHost` renders the app without
   leasing, and the lease starts only when the app calls. The "Starting its
   server…" wait leaves the host; showing progress becomes the app's.
   A failed lease no longer throws from the host.
3. **The lease's life.** The window holds the lease from the first call
   until it closes, as it holds it today from its open; the descriptor's
   server stops when its last lease goes, as today.
4. **Native apps.** `NativeAppHost` keeps its behaviour unless it shares the
   code path; if it does, keep it leasing at open.
5. Document the call in its doc comment in `system.ts` (the kit has no
   separate guide), and bump `packages/ui`'s version as a backward-compatible
   kit change.

## Must preserve

- One server per descriptor, shared by every window that holds a lease.
- `MAX_SERVERS` and the crash restart behave as today.

## Acceptance

- Tests: a `service` kit app renders with no lease taken; its first call
  starts the server and resolves; a second call reuses it; a failing start
  rejects the call and leaves the window open; closing the last window that
  called stops the server.
- A static kit app never leases.
- Typecheck, lint and the marketplace tests in `apps/core` and `packages/ui`
  pass. The backend's marketplace e2e is heavy: leave it to the owner's full
  run, and say so in the outcome.

## Files you OWN

- `packages/ui/src/system.ts` (the new call)
- `apps/core/src/modules/marketplace/KitAppHost.tsx`
- `apps/core/src/modules/marketplace/useServerLease.ts`
- `apps/core/src/system/createSystemHandle.ts` (wiring the call)
- their tests
