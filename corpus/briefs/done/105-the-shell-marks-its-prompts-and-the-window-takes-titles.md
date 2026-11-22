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

## Outcome (2026-11-22)

Built in `debff7d` (1.398.0).

- **The bash file**, `infrastructure/bash/imbatranim-shell-integration.sh`, goes with the prompt file into
  `/etc/bash/` (the Dockerfile now copies the folder, in both stages). Alpine's `/etc/bash/bashrc` sources
  every `/etc/bash/*.sh`, so the file guards itself: bash, `TERM_PROGRAM=imbatranim`, interactive, once.
  It sorts after the prompt file, so it sees that PS1. `PROMPT_COMMAND` becomes
  `('__imbatranim_status=$?' <the user's entries> __imbatranim_prompt)`: the status is taken before any
  other entry can change `$?`, the marks come last, and a `~/.bashrc` that adds its own keeps both. At each
  prompt: `D;<status>` (not before the first), `A`, OSC 7 and OSC 2; `B` at the end of PS1 inside `\[ \]`,
  added again from the hook when a `~/.bashrc` replaced PS1; `C` from PS0. The OSC 7 path percent-encodes
  every byte outside `A-Za-z0-9._~/-`, by the byte's low eight bits: musl's C locale reads a high byte as
  U+DF80 plus the byte, glibc's as a negative number, and both bashes encode `é` as `%C3%A9`. The title is
  the directory with `~` for the home, control characters made `?`.
- **The env vars**, in `terminalEnv`: `TERM_PROGRAM=imbatranim` always and `TERM_PROGRAM_VERSION` when the
  OS's version is known. `osVersion()` moved to `apps/backend/src/lib/os-version.ts`, so the gateway and
  `SystemService` read it one way.
- **The Terminal**: `lib/shellState.ts` (`applyMark`, `cwdFromOsc7`, `windowTitle`), the 133 and 7 handlers
  through `term.parser.registerOscHandler`, a marker at each `A` (disposed ones dropped as new ones come), and
  `term.onTitleChange` → `system.window.setTitle`. `D` counts only after `C`, since bash says `D` at every
  prompt, an empty line included.

**Not as the brief said:** the state goes to the pane's `data-shell-phase`, `data-shell-exit` and
`data-shell-cwd` attributes instead of a debug log, so a look in the inspector or a walk script reads it and
the source gains no console line. The glossary is at its 200-line cap, so "shell marks" isn't added there;
the integration file's header defines it, and 106-108 use the word as it stands here.

**Tests:** `shellState.test.ts` replays a session recorded from Alpine's bash 5.3 under node-pty with the
file sourced: `(exit 2)`, `false`, an empty line, then `cd` into a directory named `a`, newline, `b`, ESC,
`]2;pwned`, BEL, `é`. The state goes prompt, input, running, prompt; the exits are 2, 1, then 0 (the empty
line changes none); the OSC 7 decodes to the real name; the stream holds only OSC 133, 7 and 2, and the
title reads `~/a?b?]2;pwned?é`. The Terminal's tests feed marks and titles through a fake parser.

**The walk ran outside Docker** (the daemon is down): Alpine's bash through musl's loader as the backend's
`SHELL`, with Alpine's `/etc/bash/bashrc` and the two files in the host's `/etc/bash` for the walk and
removed after. `ls`, `false` and `cd /tmp` showed exit 0, 1 and 0 and the cwd `/tmp`; `sleep 3` showed
`running`. `vim -c 'set title'` put "package.json (/home/user/imbatranimos) - VIM" on the window and the
taskbar, and `:q` brought back `/tmp`. Plain `vim` with the host's settings sets no title, so the walk turned
it on. The dev-container walk is the owner's, with the deploy.

`npm run check` exit 0 (one earlier run timed out the marketplace e2e while the local backend was starting;
it passed on the rerun); `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server` (the image rebuilds).
