# Brief 106: A long command's end is a toast; closing asks only while one runs

**Depends on:** 105 (shell state). **Runs after:** 105.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 3.

## Context

- Ghostty 1.3 added `notify-on-command-finish`: when a command that ran
  longer than a set time ends while the terminal isn't focused, a bell or a
  desktop notification. It also skips the close confirmation when the cursor
  sits at a prompt.
- After brief 105 the Terminal knows when a command starts and ends, and its
  exit code. The kit has `system.notify` (live toast actions, history rows
  that open the app), `system.window.isFocused()`, `system.window.focus()`
  and `system.window.onCloseRequest(guard)`.
- Today closing a Terminal never asks, even with a build running.

## Decisions

Built defaults; the threshold and the wording are taste, asked on the end
move.

1. **The toast.** A command that ran at least 10 s and ends while its window
   isn't focused gives one `system.notify`: "Command finished" (level info)
   or "Command failed, exit 2" (level warning), with the window title and the
   duration in the body ("2 min 14 s in ~/projects/x"), and a Show action
   that focuses the window. No sound.
2. **A switch**, "Notify when a long command finishes", on by default. The
   Terminal has no menu (only a strip that appears for status and search), so
   it is a command in a new command-palette source on the add-on's manifest
   (`src/index.ts` has none yet), kept in `localStorage` like the font size
   (`lib/fontSize.ts`).
3. **The close guard.** While the state is `running`, closing the window asks
   through the kit's `useConfirm()`: "A command is still running. Close the
   Terminal anyway?" At a prompt it closes at once. Without shell marks (an
   old image, a user rc that broke them) it closes at once, as today.

## Files you OWN

- `apps/add-ons/repl-interpreter/src/`: `Terminal.tsx`, a new
  `lib/commandNotify.ts`, tests.
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. Tests with fake time: 9 s unfocused gives nothing; 11 s unfocused gives
   one toast; 11 s focused gives nothing; a failed command says its code; the
   switch off gives nothing. The guard asks while running and not at a prompt.
2. Wire it up.
3. Walk it in the dev container: `sleep 12`, focus another window, see the
   toast, click Show; `sleep 600` and close the window, see the question;
   at a prompt, close straight away.

## Acceptance

- [ ] Toasts and the guard behave as above.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`,
  with `--question` on the 10 s threshold and the toast wording.

## Outcome (2026-11-22)

Built in `f5fecb8` (1.400.0), with the defaults as drawn: 10 s, "Command finished" (info) or "Command failed,
exit N" (warning), the body "2 min 14 s in <the window's title>", a Show action, no sound.

- `lib/commandNotify.ts`: `finishedToast` (the rule), `formatDuration`, the switch in `localStorage`
  (`imbatranim:terminal:notify-long-commands`, on unless it reads `off`), and `notifySwitchSource`, the
  manifest's first command source: one result, "Notify when a long command finishes: on" (or off), whose
  activation turns it the other way. The Terminal reads the switch as each command ends, so a change reaches
  open windows at once.
- The Terminal raises the toast from its OSC 133 handler when a `D` ends a `running` state, with
  `system.window.isFocused()` and the title the window last took (the directory, or what the program set).
  A replayed ring after a reattach brings its `C` and `D` back to back, too short for a toast.
- **The close guard** asks through the kit's `useConfirm()` ("Close the Terminal anyway?" / "A command is
  still running.", Close and Cancel) while the state is `running`; at a prompt, or with no marks, it sends
  brief 102's close frame and closes at once.

**Beyond the brief's files, and why:** a toast action is intent data that calls `openApp` on the raising
app, and for the multi-instance Terminal that opens a new window. `apps/core/src/shared/intents/openApp.ts`
now brings back one of the app's own open windows when the payload names it (`{ showWindow: <id> }`); a
toast's action is stamped with the app that raised it, so no app reaches another's window. Two tests pin it
(a hidden Terminal comes back on top, a Notepad id never reached), and the kit's `SystemNotifyAction` doc
says so. No kit version moves: a payload was always free-form, and an older desktop opens a new window, as
before.

**Tests (fake time):** 9 s unfocused gives nothing, 11 s unfocused one toast, 11 s focused nothing, `D;2`
says its code, the switch off gives nothing; the guard asks while running (Cancel keeps the window, Close
sends the close frame), not at a prompt, and not without marks.

**The walk ran outside Docker** (the daemon is down), with Alpine's bash and the integration as in brief
105's walk. `sleep 12`, then Calculator opened on top: "Command finished" / "12 s in ~" after it ended, and
Show put the same Terminal window on top (still one Terminal). `sleep 600` and the title-bar close: the
question, and Cancel kept the window. At a prompt the close went straight through. The dev-container walk is
the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's, with `--question` on the 10 s threshold and the toast's wording.
Owner step: `node cli.ts imbatranim-os server`.
