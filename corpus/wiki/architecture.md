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

**System apps (built 2026-07-17, briefs 10–13):**
- **Terminal** — xterm.js ↔ node-pty over an authenticated WS at
  `/api/pty` (backend `pty` module; session check on upgrade,
  backpressure, revocation sweep). The fork's HTTP `repl` module is
  deleted — absorbed.
- **Files** — explorer over the real home dir (`files` module, `home`
  root via FILES_ROOT; traversal/symlink jail with tests; upload capped
  via FILES_MAX_UPLOAD_BYTES, over-cap → 413).
- **System monitor** — real CPU/RAM/disk/process data from /proc
  (`system` module) + uid-scoped kill + About panel (IMAGE_VERSION).
- **Auth** — `auth` module: argon2id, `imb_session` httpOnly cookie,
  first-run wizard, optional TOTP, per-IP throttle, global APP_GUARD +
  `@Public()`, `ws-auth.ts` for WS upgrades; security-headers middleware
  (CSP etc.; HSTS is the reverse proxy's job).

**Productivity apps (surviving the fork prune):** sticky notes, todo,
bookmarks, notepad. **Cut from the fork (brief 08):** docker desktop,
service launcher, and the backend `docker` + `services` modules (they
assume a dev host, not a container).

**Dependency layout quirk (fork):** frontend runtime deps are split across
`apps/package.json` (hoisted parent) and `apps/frontend/package.json`; both
need `npm install` (brief 16 would fix this with npm workspaces).

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
