# ImbatranimOS

A real little computer whose screen is a browser tab.

`docker run` one container and you get a real Alpine Linux userland — with
its own filesystem, its own shell, its own process table — and a React web
desktop as its display. Not a simulation, not a mockup of a terminal: the
Terminal app is a real shell running as an unprivileged user inside the
container, the Files app browses the container's actual home directory, and
the System Monitor shows the container's actual CPU, RAM, disk, and
processes. The browser is just the screen; the computer is the container.

It's also a small joke about aging (*„îmbătrânim"* — Romanian for "we're
getting old") that happens to be a fully working desktop environment.

## Quick start

You need Docker and Docker Compose. Everything else is built from source —
there is no image registry to trust, just this repo.

```bash
git clone https://github.com/gandolh/ImbatranimOS.git
cd ImbatranimOS
docker compose -f infrastructure/docker-compose.yml up imbatranimos
```

That builds the image (Alpine + Node, the desktop and the API baked into one
slim container) and starts it, publishing the desktop on `:8080` with your
files kept in a named Docker volume. Equivalently, without Compose:

```bash
docker run -p 8080:8080 -v imbatranim-home:/home/imbatranim imbatranimos
```

Open **http://localhost:8080**.

## First visit

The first thing you see is **Set up this machine**, not a login screen. There
is no default password, ever. Choose your name and a password (10 characters
minimum) and you're in. Every visit after that asks for the password.

If the machine is reachable by other people before you claim it, start it with
`SETUP_TOKEN=<something only you know>`: setup then also asks for that token, so
nobody else can claim it first.

**Cover screen** in the Start menu hides the desktop while you step away. It
is not a lock: anyone at the machine can uncover it. To end the session, use
**Log off**.

### Inside a Ward estate

If you run ImbatranimOS next to other apps that share
[Ward](https://github.com/gandolh/wzd_auth) sign-in, set all three of
`WARD_PUBLIC_ORIGIN`, `WARD_API_BASE_PATH` and `WARD_APP_KEY`. Sign-in,
passwords and two-factor then live at Ward, an account needs an
`imbatranim-os` grant from Ward's console, and the local sign-in above is
switched off. Setting only some of the three refuses to start.

## The apps

- **Terminal** — a real shell (via `node-pty`) on the container, over an
  authenticated WebSocket. Not xterm.js pointed at nothing; an actual PTY.
- **Files** — browses and edits the real `imbatranim` home directory.
- **System Monitor** — live CPU, RAM, disk, and process list, for real.
- **Sticky Notes, Todo, Bookmarks, Notepad** — the small stuff that makes a
  desktop feel like yours.
- **Settings** — theme, accent color, and changing your password.

All of it runs as the unprivileged `imbatranim` user — no sudo, by design.

## Deploying on a VPS with HTTPS

The container itself only ever speaks plain HTTP; TLS is meant to be
terminated by a reverse proxy in front of it (Caddy gets you automatic
Let's Encrypt certs in about four lines). The full recipe — the Caddyfile,
the env var to flip (`TRUST_PROXY`), and why built-in TLS
was rejected — lives in [infrastructure/README.md](infrastructure/README.md).
Don't expose the plain-HTTP port directly to the internet; put the proxy in
front of it first.

## A server ISO (planned)

Docker is the way to run ImbatranimOS, and everything above is the supported
path. The bootable ISO is changing direction: instead of a kiosk with a
fullscreen browser, it becomes a plain **Alpine Linux server image** with
ImbatranimOS pre-installed, which you reach from other machines on your
network over **HTTPS**, signing in with the local sign-in above. The
[`iso/`](iso/README.md) directory still builds the earlier kiosk variant until
that work lands.

## Data & backup

Everything that makes the container "yours" — your password hash, your
notes, your files — lives under `/home/imbatranim` inside the
`imbatranim-home` named Docker volume, not inside the container's writable
layer. Delete and recreate the container as often as you like; the volume
is what persists.

**Back it up from inside the OS: Settings → Backup.** "Download backup" streams
the whole volume out as `imbatranim-home-YYYY-MM-DD.tar.gz` — the database
included as a consistent `VACUUM INTO` snapshot rather than a hot copy, the
Trash left behind. "Choose a backup file…" reads an archive, shows its date and
exactly which folders it would replace, and applies it only after you type
`RESTORE`. With the local sign-in you are signed out afterwards, because the
backup brings its own password with it: sign in with the password the backup
was taken with. This is the path to use. It is the only one available on the
server ISO or on a hosted instance, where there is no host shell to run docker
from.

If you do have host access, the equivalent tarball is:

```bash
docker run --rm -v imbatranim-home:/home/imbatranim -v "$(pwd)":/backup \
  alpine tar czf /backup/imbatranim-home-backup.tar.gz -C / home/imbatranim
```

Restore it into a fresh volume the same way, in reverse (`tar xzf` instead of
`czf`, extracting into the mounted volume). Note that this copies `db.sqlite`
while the container is running, which the in-OS backup deliberately does not —
stop the container first if you take a backup this way.

## FAQ

**Is it safe to expose to the internet?**
It's designed for it: a single owner, an scrypt-hashed password, sessions in
an `httpOnly`/`SameSite=Lax` cookie (only a hash of it is stored), per-IP
backoff on failed sign-ins, an optional setup token for the first claim, and
an Origin check on every state-changing request. The local sign-in has no
two-factor; for that, run it inside a Ward estate. Put it behind the
documented HTTPS reverse proxy (see above). The app itself never terminates
TLS.

**What's the user / no-sudo story?**
Everything inside the container — the shell you get in Terminal, the
process that serves the desktop — runs as `imbatranim`, an unprivileged
user created in the image. There's no sudo available by default; the
container is not meant to be run as root.

**How do I reset my password if I forget it?**
There's no in-app "forgot password" flow: setup runs once and refuses to run
again while an owner exists (no silent password reset). If you're locked out,
stop the container and clear the owner from the database in the volume, which
keeps everything else:

```bash
docker run --rm -v imbatranim-home:/home/imbatranim alpine sh -c \
  "apk add -q sqlite && sqlite3 /home/imbatranim/.imbatranim/db.sqlite \
   'DELETE FROM local_owner; DELETE FROM local_session;'"
```

Start it again and **Set up this machine** runs once more. Back the volume up
first (see Data & backup above).

## Screenshots

![Desktop](docs/screenshots/desktop.png)
![Terminal](docs/screenshots/terminal.png)
![Files](docs/screenshots/files.png)
![System Monitor](docs/screenshots/system-monitor.png)

*(Drop your own PNGs into `docs/screenshots/` with these filenames and
they'll show up here.)*

## Developing

The repo is an npm workspace with [Turborepo](https://turborepo.dev) as the
task runner — one install, one lockfile, one entry point for every task:

```
apps/
  backend/      NestJS API + PTY/FS/system endpoints (its own modules tree)
  core/         the desktop: shell, window manager, auth, settings (@imbatranim/core)
  add-ons/      one package per desktop app (@imbatranim/<name>)
```

```bash
npm install        # once, at the repo root — installs everything
npm run dev:local  # Nest watch (:3001) + Vite HMR (:5173), in parallel
npm run dev        # the same inside the compose dev profile (see below)
npm run build      # builds backend + desktop (cached — a second run is instant)
npm run lint       # lints every package
npm run typecheck  # typechecks every package
npm run test       # every package's tests, plus the backend e2e suite
npm run format:check
```

The same works containerized: the compose dev profile
(`docker compose -f infrastructure/docker-compose.yml --profile dev up`)
runs `turbo dev` inside the image with your `apps/` bind-mounted for HMR.

### Adding a desktop app (add-on)

Apps that open in a window are workspace packages under `apps/add-ons/`,
kept apart from the OS so they can be added/removed without touching core:

1. Create `apps/add-ons/<name>/` with a `package.json` (name it
   `@imbatranim/<name>`, copy an existing add-on's scripts/devDeps), a
   `tsconfig.json` extending `../tsconfig.base.json`, and an
   `eslint.config.js` (copy one — it carries the import-boundary rules).
2. Put your app in `src/`, importing anything it needs from
   `@imbatranim/core` only (UI kit, `api`, stores, `openApp` — the public
   surface in core's `src/index.ts`).
3. Export a `manifest: AddonManifest` from `src/index.ts` — id, name, icon,
   component, window sizes, plus optional `commandSources` for the command
   palette.
4. Register it in the ONE place core knows about add-ons:
   `apps/core/src/manifest.ts` (one import + one array entry), and
   `npm install` to link the workspace.

Nothing else in core changes; the boundary (add-ons → core only, core
imports add-ons only in `manifest.ts`) is enforced by eslint.

## Project knowledge

Architecture, locked decisions, and work briefs live in
[corpus/](corpus/index.md), including the pivot history from this repo's
earlier ISO-based era.

## License

ImbatranimOS is licensed under the **GNU Affero General Public License v3.0
only** (AGPL-3.0-only) — see [LICENSE](LICENSE). The Docs editor is built on
[SuperDoc](https://github.com/Harbour-Enterprises/SuperDoc), which is AGPL-3.0;
the whole repository adopts the same license so the combined work stays
compliant. In short: the source is public and stays public, and if you run a
modified version as a network service you must offer its source to users.
