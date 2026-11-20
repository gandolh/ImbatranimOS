# Brief 105: The shell marks its prompts and the window takes titles

**Depends on:** 104 (bash). **Runs after:** 104.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 3.

## Context

- Shell integration in Ghostty, VS Code, kitty and WezTerm rests on two
  sequence families. OSC 133 marks where a prompt starts (`A`), where typing
  starts (`B`), where a command's output starts (`C`) and where it ended, with
  its exit code (`D;<code>`). OSC 7 reports the working directory as a
  `file://host/path` URL.
- The Terminal handles neither, and ignores OSC 0/2 titles: no
  `onTitleChange`, no OSC handlers (`apps/add-ons/repl-interpreter/src/Terminal.tsx`).
  The kit already has `system.window.setTitle`.
- Ghostty 1.4 fixed GHSA-2r63-vmw6-3m3c: a crafted directory name made its
  zsh integration emit arbitrary escape sequences. Paths in OSC 7 must be
  percent-encoded.
- This brief is the base for 106 (finished-command toast, close guard), 107
  (prompt jumps, click to move) and 108 (open in a folder).

## Decisions

1. **The integration is a system-wide bash file** in the image, sourced by
   the system bashrc only when `TERM_PROGRAM=imbatranim`, which the gateway
   sets with `TERM_PROGRAM_VERSION` (the convention Ghostty, VS Code and
   iTerm2 use). Linux apps' own terminals and scripts never run it.
2. It appends to `PROMPT_COMMAND` (bash 5.1+ array form) and `PS0`, never
   replaces a user's: `D;$?` then `A` at each prompt, `B` at the end of `PS1`
   inside `\[ \]` (added again from `PROMPT_COMMAND` when missing, since a
   user's `~/.bashrc` may set its own `PS1`), `C` from `PS0`, OSC 7 with the path percent-encoded
   (every byte outside unreserved URL characters), and an OSC 2 title of the
   directory with `~` for home, as Debian's default bashrc does for xterm.
3. **The Terminal keeps a shell state per window**: `prompt`, `input`,
   `running` (with its start time), the last exit code and the cwd, fed by
   `term.parser.registerOscHandler` for 133 and 7, plus an xterm marker at
   each prompt start for 107.
4. **Titles**: `term.onTitleChange` → `system.window.setTitle`, control
   characters stripped, 120 characters at most; an empty title falls back to
   "Terminal".

## Files you OWN

- `infrastructure/` (the integration file, the Dockerfile line that copies
  it), `apps/backend/src/modules/pty/` (the two env vars, in `terminalEnv`).
- `apps/add-ons/repl-interpreter/src/`: `Terminal.tsx`, a new
  `lib/shellState.ts` and its test.
- Corpus: `wiki/glossary.md` ("shell marks", if the term sticks),
  `wiki/status.md` (append to a line), `log.md`.

## What to do

1. `shellState.ts` with tests from recorded sequences: a prompt, a command
   that fails with 2, a `cd` into a directory named with a newline and an
   ESC (the OSC 7 arrives encoded and decodes to the real path).
2. The bash file. Test it in the dev container through the Terminal:
   `printf` nothing, just run `ls`, `false`, `cd /tmp` and read the state in
   a debug log.
3. Titles: `vim` sets its title and the taskbar shows it; on exit the
   directory title returns.

## Acceptance

- [ ] The state follows prompts, commands, exit codes and the cwd; a hostile
  directory name can't inject a sequence; titles reach the window and the
  taskbar.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
