---
summary: Locked choices of the web-OS era (2026-07-16 pivot grilling) plus a compressed record of the superseded ISO-era decisions — do not relitigate without an explicit revisit and a log entry.
updated: 2026-07-16
---

# Decisions (locked)

Changing any entry requires an explicit revisit + a `log.md` entry.

## The pivot itself (2026-07-16)

- **ImbatranimOS is a web-OS, not an installable distro.** A slim
  Alpine-based Docker container running a real Linux userland; the entire
  GUI is a React web desktop served from the container. All ISO-era
  decisions are superseded except where explicitly carried over below.

## Web-OS era decisions (fourth grilling, 2026-07-16)

- **Nature: B — real OS, browser = screen.** Not a browser simulation, not
  just an app platform: the terminal is a real PTY, the file explorer walks
  the real filesystem, the monitor shows real processes.
- **Runtime: Docker container.** `docker run -p 8080:8080 -v …` is the
  product. Bootable/kiosk variants are explicitly not v1.
- **Backend: NestJS/Node** — familiarity + code reuse from
  minimal-web-desktop beats Go's smaller image; accepted trade: image
  ~100–150MB instead of ~20MB. Single port serves statics + API + WS.
- **Frontend: fork minimal-web-desktop** (React/Vite/TS, Tailwind v4,
  Framer Motion, NestJS patterns) and evolve it into ImbatranimOS.
- **Keep the fork's repo layout** (`apps/frontend`, `apps/backend`,
  `infrastructure/`); import code only and DROP the fork's own
  corpus/CLAUDE.md/.agents/UBIQUITOUS_LANGUAGE.md. [brief 08 grilling]
- **Dual-mode container, one multi-stage Dockerfile**: `dev` target runs
  Nest + Vite HMR (2 ports); `prod` target = Nest serves built statics on
  1 port, slim. The "one port / serve statics" rule describes PROD; HMR is
  a dev-target feature. [brief 08 grilling — amends the item below]
- **Security: internet-exposable with proper auth from day 1.** Single
  user; sessions + strong password, optional TOTP, rate-limited login;
  HTTPS built-in or via documented reverse proxy.
- **Shell trust: `imbatranim` user, NO sudo by default.** PTY/FS/API all
  act as this unprivileged user; container runs unprivileged. Root access
  is not a v1 feature.
- **User model: single user.** One login, one Linux user, one home.
- **Persistence: `/home/imbatranim` is a named Docker volume**; the SQLite
  app DB lives inside it. Delete the container, keep your computer.
- **v1 apps:** Terminal (xterm.js + node-pty/WS), Files (real FS),
  System monitor, plus the fork's sticky notes / todo / bookmarks /
  notepad. Cut: docker desktop, service launcher.
- **ISO-era code deleted uncommitted** (explicit choice over archiving);
  the corpus log is the record.

## Carried over from the ISO era (still binding)

- **Identity: Windows-7-classic layout** (taskbar, start button + compact
  menu, tray, desktop icons) rendered **modern flat, classy black & white
  with parameterized accent colors** (accent picked from mockups during the
  reskin work). Name stays ImbatranimOS.
- **Versioning: semantic.** v1.0 = the friend-run bar met.
- **Finish line: friend-run bar** (adapted from friend-install): a friend
  with Docker runs one documented command, logs in, and uses
  terminal/files/notes unaided.
- **Distribution: build-from-source** (clone + docker build/compose);
  registry publishing is an open question, not a promise.
- **Lightweight as identity** — now meaning: slim image, fast cold start,
  snappy desktop; no dependency bloat without a fight.

## Superseded (ISO era, 2026-07-16 — record only)

Ubuntu 26.04 + LXQt/X11 install-on-hardware distro; hand-rolled
debootstrap→chroot→squashfs→xorriso pipeline driven by build.c on tsoding's
nob.h with .sh chroot steps; privileged-Docker-on-WSL2 build host (smoke
test PASSED — durable finding: debootstrap/chroot/mksquashfs work fine in
privileged Docker on WSL2); Calamares, Secure Boot shim, dual-boot, SDDM,
PipeWire, VLC, Fluent-fork theming, QML welcome app, 2GB-with-zram floor.
Full detail: superseded briefs 01–07 and log.md entries of 2026-07-16.
