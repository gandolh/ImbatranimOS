# Brief 178 — Alt+Tab works while a Terminal has the keyboard

## Context

From the todo
[keyboard-focus-gaps-after-brief-174](../../todos/keyboard-focus-gaps-after-brief-174.md),
its first gap. The owner chose the fix on 2026-10-27: **the switcher listens in
the capture phase.**

xterm handles Tab and stops the keydown, so it never reaches the switcher's
bubbling listeners on `window`
([`AltTabSwitcher.tsx:113-119`](../../../apps/core/src/shared/components/switcher/AltTabSwitcher.tsx)).
Seen in Chrome on 2026-10-27: a capturing listener saw the Tab keydown, the
bubbling one did not. Since brief 174, focus lands in a Terminal after every
taskbar or Alt+Tab activation, so switching away from one by keyboard fails
more often than before.

Brief 174 said to leave the overlay's own keyboard handling alone. The owner
lifted that for this change.

## Spec

1. Register the switcher's `keydown` and `keyup` listeners in the capture phase
   (`{ capture: true }`, and the same flag on removal).
2. When the switcher acts on a key (Alt+Tab, Alt+Shift+Tab, and the keys it
   handles while open), stop it there, so the Terminal does not also get a Tab.
   Every key the switcher does not act on goes on to the focused element
   unchanged.

## Must preserve

- Alt+Tab, Alt+Shift+Tab, Escape and the release of Alt behave as they do now
  outside a Terminal.
- Tab without Alt still reaches xterm (completion in the shell) and every other
  app.
- The cover screen rule (brief 101): nothing moves focus while the shell is
  suspended.

## Acceptance

- Two Terminals and a Calculator open, focus in a Terminal: Alt+Tab opens the
  switcher, Tab steps through it, releasing Alt commits, and the chosen window
  gets the keyboard (brief 174's helper).
- In that Terminal, Tab alone still completes a command.
- A unit test drives the capture-phase listener with a keydown whose target
  stops propagation.
- `npm run typecheck`, `npm run lint`, `npm test -w @imbatranim/core` pass;
  walked in Chrome in the dev container.

## Files you OWN

- `apps/core/src/shared/components/switcher/AltTabSwitcher.tsx` and its test
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/store/*`: briefs 164–167 and 169 own it.
- The Terminal app's xterm setup.
