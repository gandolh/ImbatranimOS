# ImbatranimOS

A real little computer whose screen is a browser tab.

ImbatranimOS is a slim Alpine-based Docker image running a real Linux
userland; its entire graphical interface is a React web desktop — Windows-7
classic layout, black & white with an accent color — served from the
container itself. The terminal in the browser is a real shell on the box.
The file explorer browses its real filesystem. It is a joke about aging
(*„îmbătrânim"* — "we're getting old") that actually computes.

**Status: pivoting.** This repo previously built an installable Ubuntu-based
ISO; that era ended 2026-07-16 (the story lives in
[corpus/log.md](corpus/log.md)). The web-OS era is specified in
[corpus/](corpus/index.md) and being built now.

## The shape of it

```
docker run -p 8080:8080 -v imbatranim-home:/home/imbatranim imbatranimos
# → open http://localhost:8080, log in, you have a computer
```

- **Image**: Alpine + Node/NestJS backend, single container, single port
- **Frontend**: React + Vite web desktop (forked from
  [minimal-web-desktop](https://github.com/gandolh/minimal-web-desktop))
- **Real system**: PTY terminal, real files, system monitor — as the
  `imbatranim` user (no sudo by default)
- **Auth**: single user, sessions + password, TOTP optional —
  internet-exposable by design
- **Persistence**: your home directory is a Docker volume

Project knowledge — architecture, locked decisions, work briefs — lives in
[corpus/](corpus/index.md).
