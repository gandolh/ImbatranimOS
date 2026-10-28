# Brief 179 — A click that opens another window leaves that window in front

## Context

From the todo
[in-window-open-raises-the-clicked-window](../../todos/in-window-open-raises-the-clicked-window.md),
found in brief 175's walk. The owner chose the fix on 2026-10-27: **once, in
`Window.tsx`.**

`Window.tsx` raises its window on any click inside it: the root's `onClick`
(`handleWindowClick`, around
[`Window.tsx:200`](../../../apps/core/src/shared/components/window/Window.tsx)
and `:271`) calls `focusWindow`. A button inside the window that opens or
raises another app runs first; then its click bubbles to the root, and the
window it sits in comes back over the app it just opened. Seen in Chrome:
Settings → Marketplace → **Open** on an app that was already open raised that
app, then Settings covered it again (z-order 19, then 20).

Brief 175's refusal panel stops its own click to dodge this. The Marketplace
pane's **Open** buttons and any app that calls `system.openApp` from a click
are still affected.

## Spec

1. In `handleWindowClick`, raise the window only when the click did not
   already bring another window to the front. One way: compare the top window
   id before the click's handlers ran (a `pointerdown`/`mousedown` on the root,
   capture phase, can note it) with the top window id when the click reaches
   the root; if it changed to another window, do nothing. Pick the simplest
   way that works, and say which in the outcome.
2. Remove brief 175's own `stopPropagation` workaround in the refusal panel if
   it is no longer needed, and say so.

## Must preserve

- A click anywhere in a background window still raises it.
- `focusWindow`'s no-op guard for the already-top window.
- Dragging, resizing and the title-bar buttons behave as now.

## Acceptance

- Settings → Marketplace → **Open** on an app already open: that app stays in
  front.
- The same for an app not yet open (a new window).
- Clicking a background window's content raises it.
- A unit test for the click-opened-another-window case.
- `npm run typecheck`, `npm run lint`, `npm test -w @imbatranim/core` pass;
  walked in Chrome in the dev container.

## Files you OWN

- `apps/core/src/shared/components/window/Window.tsx` and its tests
- brief 175's refusal panel in `apps/core/src/modules/marketplace/` (only to
  drop the workaround)
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/store/*`, `windowStore.ts` included: briefs 164–167
  and 169 own it. The fix lives in the component.

## Outcome (2026-10-28)

**Built in `90cf397` (version 1.41.0), walked in Chrome in the dev
container.** The way picked: the window root notes the store's `nextZIndex`
in a React click-capture handler (`onClickCapture`), which runs before any
handler inside the window, and `handleWindowClick` raises the window as before
unless that counter moved during the click and another window is now on top.
Every open, raise and restore mints a z from the counter; closing and
minimising don't. That is simpler than the `pointerdown` the brief suggested
and closer: it is the same click event, so a click made from the keyboard
counts too, and a click that only minimised or closed the window on top still
raises the clicked one (comparing top ids alone would not). The store is
untouched, and `focusWindow`'s no-op guard still saves a click on the top
window from minting a z.

Brief 175's refusal panel no longer stops its own click; Open Settings bubbles
to the root like any other button.

The walk used brief 163's kit fixture installed from a local `file://`
repository, because its Kit Hello opens one window (every Office app opens
several, so their Open always makes a new window):

- Kit Hello open, then Settings over it. Settings → Marketplace → **Open Kit
  Hello**: Kit Hello came to the front (z 3) and Settings stayed behind (z 2).
- Kit Hello closed, the same **Open** again: the new window stayed in front
  (z 4).
- A click on Settings' content where Kit Hello did not cover it raised
  Settings (z 5).

Dragging, resizing and the title-bar buttons were used through the walks of
178 and 180 as before.

**Tests:** `Window.test.tsx` (new, 5: a click that raised an open window, one
that opened a new window, a background window's content, a button that only
minimised the top window, no z minted for the top window; the first two fail
without the change); `RefusalPanel.test.tsx` no longer asserts the stopped
click. Gates: typecheck, lint and core tests pass.
