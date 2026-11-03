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
