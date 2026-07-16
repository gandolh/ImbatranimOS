---
summary: Web-OS era stack — Alpine + NestJS container exposing one authed port, React/Vite desktop (minimal-web-desktop fork), PTY/FS/monitor system apps, volume-backed home.
updated: 2026-07-16
---

# Architecture

## The one-sentence version

One Docker container (Alpine + Node) = the computer; one exposed port
serving both the React desktop and the API/WebSockets; the browser is the
display.

## Layers

| Layer | Choice |
|---|---|
| Image | Alpine-based, Node LTS, single container, one multi-stage Dockerfile with `dev` (Nest+Vite HMR, 2 ports) and `prod` (Nest serves statics, 1 port, slim ~<150MB target) targets |
| Backend | NestJS (TypeScript) — prod: serves built frontend statics + REST API + WebSockets on ONE port |
| Frontend | React + Vite + TS + Tailwind v4 + Framer Motion, Base UI, Zustand, TanStack Router+Query, react-hook-form+Zod, xterm — forked from minimal-web-desktop |
| System user | `imbatranim`, **no sudo by default**; PTY and FS APIs act as this user |
| Auth | Single user; sessions + password, TOTP optional, rate-limited login; HTTPS via built-in or documented reverse proxy — internet-exposable |
| Persistence | `/home/imbatranim` is a named Docker volume; the app SQLite DB lives inside it |
| Desktop UX | Windows-7-classic layout: taskbar, start button/menu, tray, desktop icons — B&W retro-flat + parameterized accent |

## v1 apps

**System apps (new, the soul of the pivot):**
- **Terminal** — xterm.js ↔ node-pty over WebSocket, real shell as
  `imbatranim`. Seed exists (fork `repl-interpreter` + `repl` module) but
  it's an HTTP command-runner, not a live TTY — brief 11 builds the real
  streaming PTY.
- **Files** — explorer over the real home dir. Seed exists (fork
  `file-manager` FE + `files`/`notes` BE modules) — brief 12 extends it.
- **System monitor** — real CPU/RAM/disk/process data. Seed exists (fork
  `system` module) — brief 13 extends it.

**Productivity apps (surviving the fork prune):** sticky notes, todo,
bookmarks, notepad. **Cut from the fork (brief 08):** docker desktop,
service launcher, and the backend `docker` + `services` modules (they
assume a dev host, not a container).

**Dependency layout quirk (fork):** frontend runtime deps are split across
`apps/package.json` (hoisted parent) and `apps/frontend/package.json`; both
need `npm install`. Fork ships zero auth (brief 10 is greenfield).

## Repo layout (adopted from the fork, 2026-07-16)

```
apps/frontend/         Vite app (the desktop)
apps/backend/          NestJS app (API, WS, PTY, auth; prod serves the build)
infrastructure/        Dockerfile (dev+prod targets), docker-compose.yml
corpus/                this knowledge base
```

The fork's own `corpus/`, `CLAUDE.md`, `.agents/`, `UBIQUITOUS_LANGUAGE.md`
are dropped on import — our corpus is the single source of truth.

## Run story (the friend-run bar)

```
docker run -p 8080:8080 -v imbatranim-home:/home/imbatranim imbatranimos
```

Built from source (clone + docker build / compose) for now — same
build-from-source distribution philosophy as the ISO era; publishing to a
registry is an open question.
