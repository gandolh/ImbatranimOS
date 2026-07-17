---
summary: Web-OS era stack — Alpine + NestJS container, one authed port, React/Vite desktop split into @imbatranim/core + add-on packages (npm workspaces + turbo), PTY/FS/monitor apps, volume-backed home.
updated: 2026-07-17
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
| Frontend | React + Vite + TS + Tailwind v4 + Framer Motion, Base UI, Zustand, TanStack Query, @xterm/xterm — forked from minimal-web-desktop, restructured (brief 17) into `@imbatranim/core` + add-on packages |
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

## Repo layout (briefs 16 + 17, 2026-07-17)

npm workspaces + Turborepo: one root `npm install`, one lockfile, root
scripts (`build`/`lint`/`typecheck`/`test`/`dev`/`format:check`) fan out
via turbo.

```
apps/core/             the desktop OS: shell, window manager, command
                       palette, auth, settings; Vite host. Published to
                       add-ons as @imbatranim/core (public-surface barrel
                       src/index.ts). src/manifest.ts is the ONLY file
                       that may import add-on packages (eslint-enforced).
apps/add-ons/<app>/    one workspace package per windowed app
                       (@imbatranim/<app>): bookmarks, file-manager,
                       notepad, repl-interpreter (Terminal), sticky-notes,
                       system-monitor, todo. Each exports a manifest
                       (AppConfig + optional command-palette sources);
                       add-ons import core's public surface only.
apps/backend/          NestJS app (API, WS, PTY, auth; prod serves the
                       build). Keeps its own modules/ tree — the add-on ↔
                       backend seam is the HTTP API.
infrastructure/        Dockerfile (dev+prod targets), docker-compose.yml
corpus/                this knowledge base
```

Adding a desktop app = new package under `apps/add-ons/` + one line in
`apps/core/src/manifest.ts` (how-to in the root README).

The fork's own `corpus/`, `CLAUDE.md`, `.agents/`, `UBIQUITOUS_LANGUAGE.md`
are dropped on import — our corpus is the single source of truth.

## Run story (the friend-run bar)

```
docker run -p 8080:8080 -v imbatranim-home:/home/imbatranim imbatranimos
```

Built from source (clone + docker build / compose) for now — same
build-from-source distribution philosophy as the ISO era; publishing to a
registry is an open question.
