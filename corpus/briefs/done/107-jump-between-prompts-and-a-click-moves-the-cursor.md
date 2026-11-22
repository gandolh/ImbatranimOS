# Brief 107: Jump between prompts; a click moves the cursor in the prompt

**Depends on:** 105 (shell state and prompt markers). **Runs after:** 106.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 3.

## Context

- Ghostty, VS Code and iTerm2 jump the view to the previous or next prompt
  (Ghostty's `jump_to_prompt`, VS Code's Ctrl+Up/Down). Ghostty 1.3 also lets
  a click inside the prompt move the cursor there, as in a text field, using
  OSC 133's `cl=line` extension: the terminal sends arrow keys.
- On a phone this matters most: the soft keyboard has no arrow keys, so fixing
  a typo in a long command means deleting back to it.
- After brief 105 each prompt start has an xterm marker, and the state says
  when the user is typing (`input`).

## Decisions

1. **Ctrl+Shift+Up and Ctrl+Shift+Down** scroll to the previous and next
   prompt marker (`term.scrollToLine`), registered with `system.shortcuts` so
   the shortcuts list shows them. Check `system.shortcuts` for a clash first
   (on 2026-11-20 core's window hotkeys used `mod+alt+shift+up`, not these).
   Readline doesn't bind them.
2. **A click or a tap on the current input line moves the cursor** there by
   sending Left or Right arrow sequences, one per character between the cursor
   and the click (a wide CJK character is one character, two cells), in the
   cursor-key mode the program set (`ESC[D` or, in application mode,
   `ESC OD`).
3. Only when all of these hold: the state is `input`, the click is on a row of
   the current command (from the `B` mark to the end, wrapped rows included),
   no mouse-tracking mode is on, and the pointer didn't drag (a drag still
   selects).

## Files you OWN

- `apps/add-ons/repl-interpreter/src/`: `Terminal.tsx`, a new
  `lib/promptCursor.ts`, tests.
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. `promptCursor.ts`: the arrow count from a click cell, with tests for a
   wrapped line, a CJK character, application cursor mode, and a click before
   the prompt's end (ignored).
2. The shortcuts and the click handler.
3. Walk it in the dev container at 1280 and at 390 with touch emulation:
   type a long command, tap in its middle, type, Enter runs the edited
   command; in `vim` a click does what vim says, not this; jump up through
   three prompts and back.

## Acceptance

- [ ] Prompt jumps work and show in the shortcuts list; a click or tap moves
  the cursor only in the case above.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.

## Outcome (2026-11-22)

Built in `068942d` (1.402.0).

- **Prompt jumps.** Ctrl+Shift+Up and Down scroll to the last prompt marker above the view's top and the first
  below it (`term.scrollToLine`); past the last one, Down goes to the bottom. No clash: core's window keys use
  `mod+alt+shift+up/down`, readline binds neither.
- **Click to move.** On the B mark the Terminal keeps a marker on that row and the cursor's column. A
  pointer-up within 4 px of its pointer-down, with no selection, while the state is `input`, with
  `mouseTrackingMode` `none` and the normal buffer, is turned into a cell from the `.xterm-screen` box;
  `lib/promptCursor.ts` counts the characters between the cursor and that cell across the command's rows (the
  B row and the wrapped ones after it), a wide character once whichever half is hit, a click past the text
  landing on its end and one before typing starts ignored. The arrows go in `ESC [` or, in application cursor
  mode, `ESC O`. Pointer events cover a mouse click and a tap alike.

**Not as the brief said, and why:** the keys are bound in xterm's own key handler and listed with
`system.shortcuts.document()`, not `register()`. `register` binds globally, so with two Terminal windows
open both would scroll; xterm's handler only reaches the focused one, and `document` is the kit's call for
keys an app binds in its own DOM. They show in the shortcuts list under Editing as "Terminal: jump to the
previous prompt" and "…next prompt".

**Tests:** `promptCursor.test.ts` (left and right, the end of the text, a click on the prompt or another row,
a wrapped line, a CJK character from either half, application cursor keys); the Terminal's tests jump
through three prompts and back to the bottom, move by click in both cursor modes, and send nothing on a
drag, under mouse tracking, on the prompt or while a command runs.

**The walk ran outside Docker** (the daemon is down), with Alpine's bash and the integration as in brief
105's walk. At 1280: "echo alpha gamma", a click on the "g", "beta ", Enter ran `alpha beta gamma`. At 390 in
Pixel 7 emulation a tap did the same. `vim -u NONE -c 'set mouse=a'` took the click itself (its cursor went
to line 9, column 8). After three commands with output between, Ctrl+Shift+Up stopped at each prompt in turn
and Down came back to the bottom. The dev-container walk is the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
