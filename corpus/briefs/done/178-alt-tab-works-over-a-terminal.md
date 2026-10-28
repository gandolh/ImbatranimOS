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

## Outcome (2026-10-28)

**Built in `770f616` (version 1.40.0), walked in Chrome in the dev
container.** The switcher's `keydown` and `keyup` listeners on `window` run in
the capture phase now, with the same flag on removal. A key the switcher acts
on is prevented and stopped there: Alt+Tab, Alt+Shift+Tab, and the arrows,
Enter, Escape and the Alt release while it is open. Every other key goes on to
the focused element untouched; behind the cover screen the switcher takes
nothing.

The walk, in headless Chrome driven by Playwright against the dev container on
remapped ports (a compose override and a throwaway home volume, both outside
the repo), with real key downs and ups:

- Two Terminals and a Calculator open, focus in a Terminal's xterm input.
  Alt down, Tab: the switcher opened. Tab again, Alt up: it closed and the
  third window in the MRU order, the other Terminal, came to the front with
  the keyboard in its xterm input.
- In that Terminal, `ech` then Tab alone completed to `echo `, and the command
  ran.

The Alt release committed for real this time; brief 174's driver could not
send it.

**Tests:** `AltTabSwitcher.test.tsx` gains four (open, step and commit over a
textarea that stops its keys; Escape taken while open and the next Alt release
left to the target; Tab without Alt reaching the target unprevented; every key
passed through behind the cover screen). Two of them fail with the old
bubbling listeners. Gates: `npm run typecheck` (32 tasks) and `npm run lint`
(31 tasks, no errors; the two warnings were there before) pass, core tests
pass.

**Found, not fixed:** global shortcuts still listen in the bubbling phase, so
Ctrl+K does not open the palette while a Terminal has the keyboard (seen in
brief 180's walk). Recorded in
[keyboard-gaps-after-brief-180](../../todos/keyboard-gaps-after-brief-180.md).
