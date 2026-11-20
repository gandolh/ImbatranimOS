# Brief 108: A Terminal opens in a folder

**Depends on:** 105 (the cwd from OSC 7). **Runs after:** 107.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 3.

## Context

- Every Terminal starts in the home folder: the gateway spawns with
  `cwd: resolveHome()` (`apps/backend/src/modules/pty/pty.gateway.ts`).
- Ghostty opens new tabs and splits in the current directory (configurable
  since 1.3), and file managers open a terminal in a folder (GNOME Files and
  Windows 11's "Open in Terminal").
- After brief 105 a Terminal knows its cwd. Apps launch others with
  `system.intents.openApp(appId, payload)`, and the launched window gets the
  payload through `onIntent`. The File Manager builds its menus in
  `apps/add-ons/file-manager/src/lib/buildMenuItems.tsx`.

## Decisions

1. **The PTY URL takes `cwd`.** The gateway accepts it if it is an absolute
   path with no control characters that names a directory the shell user can
   enter; otherwise it starts in home, as today. The spawn runs as the user
   anyway, so this checks for mistakes, not access.
2. **The Terminal reads `{ cwd }` from its launch payload.**
3. **A new Terminal from a Terminal** opens in the first Terminal's current
   cwd: Ctrl+Shift+N in the Terminal's key handler (check `system.shortcuts`
   for a clash first), documented with `system.shortcuts`. The Terminal has no
   menu, and a palette command can't tell which Terminal it came from.
4. **Files: "Open in Terminal"** on a folder's context menu and on the
   folder background menu, opening a Terminal there.

## Files you OWN

- `apps/backend/src/modules/pty/` (URL parsing, the check, specs).
- `apps/add-ons/repl-interpreter/src/` (`ptyUrl.ts`, `Terminal.tsx`, tests).
- `apps/add-ons/file-manager/src/lib/buildMenuItems.tsx` and its test.
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. Specs: a valid folder is used; a relative path, a file, a missing path and
   a path with a newline fall back to home.
2. The payload, the New window path, the Files items.
3. Walk it: Files → a folder → Open in Terminal, `pwd` says it; `cd /tmp`,
   New window, `pwd` says `/tmp`.

## Acceptance

- [ ] Terminals open where asked, and fall back to home on anything invalid.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
