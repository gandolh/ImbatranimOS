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
