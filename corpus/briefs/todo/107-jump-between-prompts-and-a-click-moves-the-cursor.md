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
   the shortcuts list shows them. Readline doesn't use them.
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
