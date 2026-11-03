# Brief 34 — Linux windows keep their places after a reload

## Context

Found while building the Linux apps layer (2026-11-03). A reload finds the
tab's running Linux apps again, but their windows come back where a new
window opens: the saved layout leaves them out
(`apps/core/src/shared/store/windowStore.ts`, the `isLinuxWindow` filters
around lines 214 and 1020), because a Linux window shows a running program,
not something to reopen. Split out of the todo
`linux-apps-after-the-first-wave` with the owner on 2026-11-03.

## Spec

1. Save each Linux window's place (position, size, maximized, workspace)
   in the layout, keyed by something that survives a reload for the same
   running window (the session's toplevel id, or the app id plus the
   window's order if there is no stable id).
2. When a reload reattaches to a running app, its windows open where they
   were. A saved place whose window no longer exists is dropped, never
   reopened: Linux windows still aren't something the layout reopens.
3. A Linux app started after the reload opens where a new window opens, as
   today.

## Acceptance

- Tests: a Linux window moved and resized, then a reload with the app
  still running, comes back at that place; a saved place for an app that
  stopped opens nothing.
- A short walk with Firefox confirms it.
- Typecheck, lint and the window store's tests pass.

## Files you OWN

- `apps/core/src/shared/store/windowStore.ts` and its tests
- `apps/core/src/modules/linux-windows/` where reattaching needs it

## Outcome (2026-11-03)

**Built in `1258820` (version 1.127.0).**
1. **The key** is the session's toplevel id with the session id
   (`LinuxWindowKey`, set on the OS window by `adoptLinuxWindow` when the
   connection opens it). The host numbers windows per session and its resync
   re-announces each live one under the same id, so the key survives a
   reload. The layout saves a keyed Linux window's place: position, size,
   maximized and workspace (with its z and visibility, which aren't applied).
2. **Reattaching.** `restoreLayout` still opens no Linux window; it keeps
   their places, and the connection's `created` takes the one under the
   announced key and opens the window there. **Beyond the brief's files:** a
   session that ends after its 30 s grace is started again under the same id
   with toplevel ids from 1, so the key alone could hand an old place to a
   new app. The gateway (`wayland.gateway.ts`) now sends the tab
   `{"type":"session","resumed"}` first on every socket; a new session drops
   the kept places, and a resumed one drops what its resync didn't claim when
   the resync ends, which the host marks with the cursor. `PROTOCOL.md`
   documents the message.
3. A Linux app started after the reload has no kept place and opens where a
   new window opens. Places still waiting are saved with the layout (two
   reloads in a row keep them), and a dropped socket keeps its windows'
   places for the reconnect, which also comes back where it was.

**Checked:**
- `placesAfterReload.test.ts` (6), the real connection and window store over
  a fake socket: a moved, resized window on workspace 3 comes back there; a
  maximized one comes back maximized; two reloads in a row; an app that
  exited during the reload opens nothing, its place is dropped, and the next
  app opens elsewhere and is the only one saved; a new session under the same
  ids gets no old place; a reconnect without a reload.
- The gateway spec (27, the session message in both paths) passes.
- In the dev container with **foot** rather than Firefox (Firefox isn't
  installed there; the path is the same): dragged and resized to 541,173
  702×526, reloaded, back at 541,173 702×526. Stopped before a reload, it
  reopened nothing and left no saved place.
- Typecheck, lint, and core's store and linux-windows tests pass.
