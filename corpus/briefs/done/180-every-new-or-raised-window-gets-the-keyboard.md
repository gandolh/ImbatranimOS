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

## Outcome (2026-10-28)

**Built in `e233299` (version 1.42.0), walked in Chrome in the dev
container.**

- **A new window** takes the keyboard from its own mount. `WindowContainer`
  renders a `FirstFocus` marker after the app inside the app's `Suspense`
  boundary, so it mounts once the app's lazy chunk has resolved and the app's
  own mount effects have run. Two frames later, and only while the window is
  still `topVisibleWindowId()` (null behind the cover screen), brief 174's
  `focusIntoWindow` puts the keyboard in by its order, which leaves alone
  focus the app already put inside (CAD's command line). The two frames let
  the Start menu or the palette hand focus back to their trigger first. A
  window that opens behind another takes nothing. A Reload after a crash runs
  it again.
- **A desktop icon, a toast's action and an app's `system.intents.openApp`**
  go through `openWithKeyboard` (in `focusIntoWindow.ts`): when `openApp`
  brought up a window that was already open, `focusIntoWindowSoon` follows; a
  new one is left to its mount. The brief listed the first two; the third is
  the same path for apps (Files opening a file in a Notepad that is already
  open) and its file was this brief's.
- **`system.window.focus()`** raises and then calls `focusIntoWindowSoon`.

A click inside a window still decides focus itself, the store is unchanged,
and `packages/ui/src/system.ts` is untouched.

The walk, in headless Chrome driven by Playwright against the dev container,
with the Office suite and brief 163's kit fixture installed from local
`file://` repositories:

- Terminal from Start: the keyboard was in its xterm input, and
  `echo typed-into-new-terminal` typed with no click ran there.
- Calculator from the palette (opened with the taskbar's Search; see below):
  the keyboard was in Calculator, and typing `42` showed 42.
- CAD from Start: the keyboard was in CAD's command line, the app's own
  focus.
- Calculator's desktop icon double-clicked while CAD was on top with the
  keyboard: Calculator came up with the keyboard in it.
- An alarm set through the Clock API for the next minute, Clock open behind
  Calculator: the toast's Snooze brought Clock up with the keyboard in it.
- `system.window.focus()`: no app calls it today, so it is covered by unit
  tests only.

**A consequence the brief did not ask for:** a window restored with the
layout at a reload mounts like a new one, so the top window gets the keyboard
after a reload. Walked: Calculator on top, reload, the keyboard in Calculator.
Nothing else gets it, since only the top window passes the check.

**Tests:** `WindowContainer.test.tsx` (new, 3: a lazy app takes the keyboard
only once its chunk has resolved, CAD-like own focus kept, a window mounting
behind another takes nothing; the first fails without `FirstFocus`),
`focusIntoWindow.test.ts` (+8: the new-window helper's two frames, own focus,
background, cover screen, cancel; `openWithKeyboard` for a raised window, a
new one and a refusal), `createSystemHandle.test.ts` (+2: `window.focus()`
moves the keyboard; nothing for a minimised window). Gates: typecheck, lint
and core tests pass.

**Found, not fixed** (files this brief did not own), in
[keyboard-gaps-after-brief-180](../../todos/keyboard-gaps-after-brief-180.md):
Ctrl+K does nothing while a Terminal has the keyboard, since the global
hotkeys still listen in the bubbling phase and xterm stops the keydown; the
palette's recent files, the Notification panel, the Start menu's recent
files, the desktop's context menu and the Marketplace pane raise an open
window without the keyboard; and `Taskbar.tsx`'s comment that a new window
"is left to its app" is stale.
