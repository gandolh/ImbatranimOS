# Brief 47 — Per-window error boundaries (a faulty app can't take down the OS)

Status: **todo** · From the 2026-07-19 OS-layering grilling
(the (c) isolation driver). CORE, frontend-only. Standalone — **no dependency on
the protocol seam (brief 48)**; ship it first. Design:
[wiki/os-layering.md](../../wiki/os-layering.md#app-isolation--threat-model-and-what-it-justifies).

## Problem

Every windowed app renders directly into core's shared React tree. A single
uncaught `throw` in one app's render/effect currently unmounts the whole desktop
(only React's default behavior stands between a buggy app and a blank screen).
The grilled (c) requirement is explicit: **a faulty app must not take down the
OS.** Apps are first-party (build-time), so the threat is a *buggy* app, not a
*malicious* one — which an error boundary fully addresses, at near-zero cost and
with no API change.

## Decisions (grilled 2026-07-19)

- **Per-window boundary, not per-desktop.** Wrap each window's app content
  (inside the window chrome) in its own React error boundary. A crash collapses
  **that window** into an in-chrome error state; the taskbar, other windows, and
  the shell keep running.
- **Error state = recoverable, in-chrome.** Show a compact "This app crashed"
  panel *inside the window* with a **Reload** (remount the app, fresh key) and a
  **Close window** action. The window chrome (title bar, close button, drag,
  z-order) is owned by the compositor and stays functional — it is *outside* the
  boundary.
- **Boundary wraps app content only**, never the chrome — so a crashed app can
  always still be closed/moved/focused.
- **Report to the notification center.** On catch, emit one `notify(...)`
  (error level: "<App> crashed") so the failure is visible even if the window is
  behind others. Deduplicate rapid re-throws (don't spam on a render loop).
- **Main-thread hygiene note (not a hard gate this brief):** an infinite loop
  still freezes the tab — error boundaries catch throws, not hangs. True
  hang-isolation is the future iframe/worker transport swap (brief 48's seam
  makes it possible), explicitly out of scope here. Document the limit; don't
  attempt a watchdog.
- **This is not the seam.** No `system` handle, no barrel split — purely a
  containment wrapper. Apps are untouched.

## Fix

1. New `apps/core/src/shared/components/AppErrorBoundary.tsx` — a class error
   boundary (React requires a class): `componentDidCatch` → `notify` (deduped) +
   set error state; renders children normally, or the error panel on catch.
   Props: `appId`, `appName`, `onReload` (remount via key bump), `onClose`.
2. New `apps/core/src/shared/components/AppErrorFallback.tsx` — the in-chrome
   panel (uses `@imbatranim/core` UI kit: a heading, the error message, Reload +
   Close buttons). Keep it tiny; no stack dump in the default view (optional
   "details" disclosure for the raw message).
3. Window renderer (the `WindowContainer` / per-window render point identified in
   `windowStore` consumers) — wrap the app component in `<AppErrorBoundary>`.
   **Reload** = bump a per-window remount key (regenerate the child key so the
   app re-mounts clean); **Close** = existing `windowStore` close action.
4. Boundary key resets on successful remount so a fixed/reloaded app clears the
   error state.

## Must preserve (regression surface)

- Window chrome (drag, resize, focus, close, z-order, taskbar button) works for a
  crashed window — the boundary is *inside* the chrome, not around it.
- A crash in one window leaves every other window + the shell fully interactive.
- No change to how apps are declared or to any app's code; `manifest.ts`
  untouched. This is a pure wrapper at the render point.
- Notification center still behaves (one deduped error toast per crash, not a
  storm on a render loop).

## Verify bar

`turbo typecheck`, core lint + format green, `turbo build` ok. A unit/RTL test
that a child throwing renders the fallback (not a thrown-through unmount) and
that Reload remounts. **Human-gated:** deliberately break one app (temporary
`throw` in an add-on's render), confirm only its window shows the error panel,
Reload recovers it, and the rest of the desktop stayed live.
