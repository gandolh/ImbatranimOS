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

## Outcome (2026-10-27)

**Built in `683ecad` (version 1.32.0), walked in Chrome in the dev
container.** The dev profile's port 5173 was taken by another project, so the
walk ran on remapped ports through a compose override kept outside the repo.
`focusIntoWindow.ts` holds the helper; the taskbar, the Alt+Tab commit, the
palette's `appsSource` and the Start menu call `focusIntoWindowSoon(id)`
after their store calls. One frame later, and only while that window is still
`topVisibleWindowId()` (null behind the cover screen), focus goes to the
element that last had it in the content area, else the first focusable
element (an iframe counts), else the content area itself, now `tabIndex={-1}`.
Nothing moves when focus is already in the window. The store is unchanged.

What the walk showed, with real clicks and key presses:

- Two Terminal windows: a taskbar click on the one behind, then `echo A` and
  Enter with no click inside: it ran in that window.
- Alt+Tab to the other Terminal, which had never been clicked: focus on its
  input, and `echo B` ran there. (Committed with Enter: the browser driver
  sends no Alt keyup.) Alt+Tab to a minimised Terminal restored it with focus
  inside.
- Minimise from the title bar, restore from the taskbar: focus back in the
  Terminal. A taskbar click on the focused window minimised it and left focus
  on its button.
- Start and the palette on an open Calculator (single-instance): focus inside
  it. The palette's Base UI dialog did not take focus back as it closed.
- A URL app installed from a local `file://` repository: its taskbar button
  focused the iframe, and Tab then a letter reached the app's input. The
  keyboard guard raised no strike.

**Not walked:** CAD. It is imbatranim-office's app and not in this catalog;
the Terminal stood in for a keyboard-first app.

**Where the build differs from the brief:**

- The brief put the Start menu on `appsSource.ts:50`. Start goes through
  `openApp` in `shared/intents/openApp.ts`, which this brief does not own, so
  the Start path is in `Taskbar.tsx`'s `launchApp`. It moves focus only when
  the app was already open; a new window is left to its app.
- Focus is remembered from the content area, not the window root, so a
  restore never lands on the title bar's Minimize. A dialog the app portals to
  `body` reaches the content area through React's tree and is remembered too.
- The content area being focusable means a click on a blank part of a window
  now focuses it rather than the page's body. `Desktop.tsx`'s Enter and Esc
  for selected icons, which act only when the body has focus, no longer fire
  after such a click; that is the right owner for those keys.

**Tests:** `focusIntoWindow.test.ts` (12: the three-step order, the iframe,
the title bar, focus already inside, the frame wait, the cover screen),
`Taskbar.test.tsx` (5), `AltTabSwitcher.test.tsx` (4) and `appsSource.test.ts`
(2). Gates: `npm run typecheck` (32 tasks), `npm run lint` (31 tasks, no
errors; the warnings in `FilePicker.tsx` and code-editor were there before),
core tests 520/520.

**Found, not fixed:** recorded in the todo
[keyboard-focus-gaps-after-brief-174](../../todos/keyboard-focus-gaps-after-brief-174.md).
Alt+Tab never opens while a Terminal has focus, because xterm stops the Tab
keydown before it reaches the switcher's window listener. That was true
before this brief, but focus now lands in a Terminal more often.
