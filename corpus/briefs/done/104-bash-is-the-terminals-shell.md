# Brief 104: Bash is the Terminal's shell

**Depends on:** 102 (a reload no longer hangs up the shell). **Runs after:** 103.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20. The call is in
[decisions-terminal.md](../../wiki/decisions-terminal.md) (revisits
2026-11-03 in [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md)).

## Context

- The Terminal's shell is BusyBox sh. `$SHELL` is unset in the image,
  `adduser -D` gives the `imbatranim` user `/bin/sh`, and the gateway spawns
  `resolveShell()` with no arguments, so it is an interactive, non-login
  shell (`apps/backend/src/modules/pty/pty.constants.ts`, `pty.gateway.ts`).
  bash isn't installed (`infrastructure/Dockerfile`, both stages; the Nix base
  profile adds only fonts and locales).
- BusyBox sh has no hook that runs before a command and, as far as anyone
  checked, doesn't ask for bracketed paste. Briefs 98 and 105-107 work much
  better on bash: bracketed paste is on by default in readline since bash 5.1,
  and `PS0` runs as a command starts.
- The 2026-11-03 decision kept BusyBox sh because it passes no SIGHUP to
  background jobs, so a reload didn't kill an app started with `&`. Brief 102
  removed that reason: a reload no longer hangs up the shell.

## Decisions

From decisions-terminal.md:

1. `apk add bash` in both image stages; the `imbatranim` user's login shell
   is `/bin/bash` (`adduser -s /bin/bash`). `resolveShell()` is unchanged: it
   reads the user's shell.
2. Background jobs follow the usual Unix rule: closing a Terminal window
   hangs up bash, which passes SIGHUP to its jobs; `nohup`, `disown` and
   `setsid` survive for the desktop session's life, as before.
3. A system-wide rc gives a plain prompt (`\u@\h:\w\$ `) only when the user
   has no `~/.bashrc` of their own. Nothing else changes in the shell's
   environment (the gateway's env, DISPLAY and the Nix PATH stay as they are).
4. `bash-completion` only if it costs under 1 MB; measure and say.

## Files you OWN

- `infrastructure/Dockerfile`, a new rc file under `infrastructure/` copied
  into the image, `apps/backend/src/modules/pty/` specs if the spawn changes.
- Corpus: `wiki/decisions-linux-apps-built.md` (the consequence line),
  `docs/architecture.md` where the Terminal is described, `wiki/status.md`
  (append to a line), `log.md`.

## What to do

1. First, verify on Alpine, in the dev container through node-pty (not a
   plain `docker exec`): which rc file bash reads as an interactive non-login
   shell (Alpine builds it with a system bashrc; find the path), that
   `bind -v | grep bracketed` says on, and the hang-up: `sleep 600 &` ends
   when the window closes, `nohup sleep 600 &` survives it, both survive a
   reload.
2. The image change and the rc file. Rebuild the dev container image (a
   Dockerfile change is the one case that needs it).
3. Measure the image size before and after.
4. Walk it: a fresh home and a home with its own `~/.bashrc`; the Linux apps
   still start from the Terminal (`firefox &` from a Terminal, then close the
   window: Firefox ends; with `nohup`: it stays).

## Acceptance

- [ ] The Terminal runs bash with bracketed paste on; the hang-up behaves as
  in decision 2; the size change is written down.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
  The end move's message starts with the visible change: an app started from
  a Terminal with a bare `&` now ends when that window closes.

## Outcome (2026-11-22)

**An app started from a Terminal with a bare `&` now ends when that window closes.** Built in `826c2f1`
(1.396.0): both image stages `apk add bash`, `adduser -s /bin/bash` gives `imbatranim` bash as its login
shell, and `resolveShell()` is unchanged (no `SHELL` is set anywhere in the image or compose, so it reads
the user's shell). `infrastructure/bash/imbatranim-prompt.sh` is copied to `/etc/bash/`: it sets
`PS1='\u@\h:\w\$ '` only when `$HOME/.bashrc` doesn't exist. No backend change, so no pty spec changed.

**Verified on Alpine's own bash**, not in the dev container: Docker's daemon is down in this session and a
chroot was refused, so Alpine 3.24's packages were unpacked into the scratchpad and its bash (5.3.9) run
through musl's loader as the backend's `SHELL`, under node-pty, with Alpine's `/etc/bash/bashrc` and the
prompt file put in the host's `/etc/bash` for the walk and removed after.

- Which rc file: the binary names `/etc/bash/bashrc` (Alpine's `SYS_BASHRC`), read by an interactive
  non-login shell, which is what the gateway spawns; it sources every `/etc/bash/*.sh`, so the prompt file
  sits there.
- `bind -v | grep bracketed` says `set enable-bracketed-paste on`; a two-line right-click paste went in
  without brief 98's question and unrun.
- `sleep 600 &` and `nohup sleep 601 &` both survived a reload; closing the window ended `sleep 600` and
  left the `nohup` one running.
- A fresh home's prompt was `root@vm:~#` (the walk ran as root; in the image it reads `imbatranim@…:~$`);
  a home with `PS1='mine> '` in its own `~/.bashrc` kept `mine>`.

**Size:** from Alpine 3.24's package index, bash brings bash, readline, libncursesw and
ncurses-terminfo-base to the prod stage, 2,122,416 bytes installed, and 2,019,399 bytes to the dev stage
(foot already brings ncurses' terminfo there). `bash-completion` is 1,060,956 bytes installed, over decision
4's 1 MB, so it isn't added. The image's own before and after (`docker image ls`) is the owner's, with the
rebuild; node:24.22.1-alpine's Alpine may be a minor release from 3.24.

**Not walked:** the Linux apps from bash (`firefox &` closing with its window, `nohup firefox &` staying):
there's no Wayland host or Nix on the host. The dev-container rebuild and that walk are the owner's.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's; its message starts: "An app started from a Terminal with a bare `&`
now ends when that window closes." Owner step: `node cli.ts imbatranim-os server` (the image rebuilds).
