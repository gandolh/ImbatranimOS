# Brief 174 — Taskbar and Alt+Tab activation move focus into the window

## Context

Promoted 2026-10-23 from the todo
[taskbar-activation-keeps-focus-on-the-taskbar](../../todos/promoted/taskbar-activation-keeps-focus-on-the-taskbar.md),
found in imbatranim-office brief 03's walk.

With two CAD windows open, click the other one's taskbar button and type a
command. Nothing happens: `document.activeElement` is still the taskbar
`<button>`, so keyboard-first apps (CAD's command line, the Terminal, editors)
need a click inside the window first. A click inside a window works only
because the click itself puts DOM focus there; `focusWindow` in the window
store raises the window and changes nothing in the DOM.

The activation paths (checked 2026-10-23):

- the taskbar: `handleTaskClick` in
  [`Taskbar.tsx:84-95`](../../../apps/core/src/shared/components/taskbar/Taskbar.tsx)
  calls `showWindow` and `focusWindow`;
- Alt+Tab: the commit in
  [`AltTabSwitcher.tsx:51-64`](../../../apps/core/src/shared/components/switcher/AltTabSwitcher.tsx)
  does the same;
- the Start menu and the launcher reach an open single-instance app through
  `focusWindow` in
  [`appsSource.ts:50`](../../../apps/core/src/shared/commands/appsSource.ts).

Each window's root carries `data-window-id`
([`Window.tsx:268`](../../../apps/core/src/shared/components/window/Window.tsx)).
Sandboxed URL apps render in an iframe (`SandboxedAppHost.tsx`), so focusing
"into the window" means focusing the iframe for them.

`SystemWindow` in [`packages/ui/src/system.ts`](../../../packages/ui/src/system.ts)
has `focus()` and `isFocused()` but no focus-change event. Adding one is not
needed for this fix and is left out.

## Spec

1. A helper in `shared/components/window/` that, given a window id, moves DOM
   focus into that window's content, in this order:
   - the element that last held focus inside that window, if it is still in
     the document (track it with a `focusin` listener on the window root);
   - otherwise the first focusable element in the content area;
   - otherwise the content area itself (`tabIndex={-1}`).
   For a window whose content is an iframe, focus the iframe element.
2. Call it after `focusWindow` on all three activation paths above, once the
   window is shown: after `showWindow` a minimised window's content may mount
   or unhide on the next frame, so wait for it (`requestAnimationFrame`).
3. A taskbar click that minimises the focused window leaves focus on the
   taskbar button, as now.

## Must preserve

- Clicking inside a window keeps working as it does: the click decides focus,
  and the helper is not called on that path.
- The Alt+Tab overlay's own keyboard handling until it commits.
- `focusWindow`'s no-op guard for the already-top window.
- The cover screen rule (brief 101): nothing moves focus while the shell is
  suspended.

## Acceptance

- Two CAD windows: click the other window's taskbar button and type `LINE`
  Enter: the command runs in that window with no click inside it.
- The same with Alt+Tab, and with a minimised window restored from the
  taskbar.
- A Terminal window activated from the taskbar takes typing straight away.
- A sandboxed URL app activated from the taskbar has the iframe focused.
- Tests for the helper's three-step order, and for the taskbar and Alt+Tab
  paths calling it; `npm run lint`, `npm run typecheck` and `npm test -w
  @imbatranim/core` pass.

## Files you OWN

- `apps/core/src/shared/components/window/` (a new helper file and its test;
  `Window.tsx` for the `focusin` tracking and the content area's `tabIndex`)
- `apps/core/src/shared/components/taskbar/Taskbar.tsx`
- `apps/core/src/shared/components/switcher/AltTabSwitcher.tsx`
- `apps/core/src/shared/commands/appsSource.ts`

## Files you must NOT touch

- `apps/core/src/shared/store/*`, `windowStore.ts` included: briefs 164–167 and
  169 own it. The fix lives in the components, not the store.
- `packages/ui/src/system.ts`: no protocol change.
- `apps/core/src/modules/linux-windows/**` (briefs 169–173).
