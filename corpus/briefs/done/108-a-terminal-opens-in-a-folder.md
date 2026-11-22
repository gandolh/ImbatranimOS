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

## Outcome (2026-11-22)

Built in `e2297e2` (1.404.0).

- **The gateway** computes the start folder before the handshake: `startDirectory(requested, home)` in
  `pty.constants.ts` takes `requested` only when it is absolute, holds no control character, is a
  directory (`stat`) and can be entered (`access`, `X_OK`); anything else gives the home folder. `cwd=`
  carries an absolute path; `root=` and `path=` go through `FilesService.resolveSafe` first (the
  PtyModule imports the FilesModule), so a Files root resolves as the Files API resolves it and a path that
  climbs out of its jail starts in home.
- **The Terminal** reads its launch payload once (`system.intents.consume()` in a `useState` initializer):
  `{ cwd }` absolute, or `{ root, path }`. The hook sends it only with `shell=`, never with `resume=`.
  Ctrl+Shift+N opens `openApp("terminal", { cwd })` with the shell's cwd from OSC 7 (else the launch
  folder, else nothing, which is home).
- **Files** gets "Open in Terminal" after Open on a folder's menu and after Paste on the background menu
  (the folder on show), never on a file or inside an archive. It sends `{ root, path }`.

**Not as the brief said, and why:**

- **Files names a folder by its root and path, not an absolute path.** Files knows only paths inside its
  roots ("home", "notes"); the absolute home folder is the backend's to know (`FILES_ROOT`). So the gateway
  takes both forms, and the root form goes through the same jail as every Files call.
- **Alt+Shift+N beside Ctrl+Shift+N.** Chrome and Edge keep Ctrl+Shift+N for a private window and never
  pass it to a page in a browser tab (an installed app window or kiosk gets it). Both are bound in xterm's
  key handler and listed in the shortcuts list, Ctrl+Shift+N with that note. Neither clashes with core's
  keys. Alt+Shift+N no longer reaches the shell as Meta-N.

**Tests:** `startDirectory` specs (a folder is used; a relative path, a file, a missing path, a path with a
newline and none fall back to home); a gateway spec that starts a real shell in a temporary folder and one
with a relative `cwd` in home; the hook sends `cwd` or `root`/`path` on a start and not on a resume;
the payload reader; the Terminal opens a new one in the shell's folder on both keys, and in home with no
folder; the menu builder offers the item on folders and the background and not on files or in archives.
The Wayland gateway and pty e2e specs, which build the PtyGateway by hand, gained FilesService.

**The walk ran outside Docker** (the daemon is down), with Alpine's bash and the integration. Files → Home →
projects → right-click x → Open in Terminal: `pwd` printed the home's `projects/x` and the window took the
title `~/projects/x`. `cd /tmp`, Ctrl+Shift+N: a second Terminal whose `pwd` said `/tmp`. The
dev-container walk is the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
