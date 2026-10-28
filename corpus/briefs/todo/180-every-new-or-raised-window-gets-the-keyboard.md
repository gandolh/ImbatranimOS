# Brief 180 — Every new or raised window gets the keyboard

## Context

From the todo
[keyboard-focus-gaps-after-brief-174](../../todos/keyboard-focus-gaps-after-brief-174.md),
its second and third gaps. The owner chose on 2026-10-27: **yes, all of
them**: opening or focusing a window from any path puts the keyboard in it, as
the taskbar and Alt+Tab do since brief 174.

Brief 174 added `focusIntoWindowSoon` in
[`focusIntoWindow.ts`](../../../apps/core/src/shared/components/window/focusIntoWindow.ts)
and calls it from the taskbar, Alt+Tab and `appsSource.ts`, but only for a
window that was already open. Left out:

- **A new window** from Start or the palette. A Terminal opened from Start left
  focus on the Start button, unless its app focuses something as it mounts.
- **A desktop icon's double-click** on an open single-instance app
  (`Desktop.tsx`, through `openApp`).
- **A toast's action** that opens or raises a window
  (`shared/components/notifications/ToastHost.tsx`).
- **`system.window.focus()`** from an app
  (`apps/core/src/system/createSystemHandle.ts`).

The last three were found by reading the code and were not walked.

## Spec

1. A new window gets the keyboard once its content has mounted: if focus is
   not already inside the window a frame or two after it mounts (an app that
   focuses itself, such as CAD's command line, wins), call brief 174's helper.
   The window must still be the focused one at that moment.
2. The three other paths call the helper after they raise a window, as the
   taskbar does.
3. Opening a window in the background, if any path does that, moves no focus.

## Must preserve

- Brief 174's order (last focused element, first focusable, the content area)
  and its iframe case for URL apps.
- A click inside a window decides focus itself; the helper is not called on
  that path.
- The cover screen rule (brief 101): nothing moves focus while the shell is
  suspended.

## Acceptance

- Terminal from Start, Calculator from the palette: typing goes to the new
  window at once.
- CAD from Start: its command line has the keyboard (the app's own focus kept).
- A desktop icon on an already open single-instance app, a toast action, and an
  app calling `system.window.focus()`: the raised window has the keyboard.
- Unit tests for the new-window case and for `system.window.focus()`.
- `npm run typecheck`, `npm run lint`, `npm test -w @imbatranim/core` pass;
  walked in Chrome in the dev container.

## Files you OWN

- `apps/core/src/shared/components/window/` (`Window.tsx`,
  `focusIntoWindow.ts`, their tests)
- `apps/core/src/shared/components/desktop/Desktop.tsx`
- `apps/core/src/shared/components/notifications/ToastHost.tsx`
- `apps/core/src/system/createSystemHandle.ts`
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/store/*`, `windowStore.ts` included: briefs 164–167
  and 169 own it.
- `packages/ui/src/system.ts`: no protocol change.
- `apps/core/src/modules/linux-windows/**` (briefs 169–173).

Run after brief 179, which also edits `Window.tsx`.
