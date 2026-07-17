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

## First login

The first thing you see is a setup wizard, not a login screen — there is no
default password, ever. Pick a password (10 characters minimum) and you're
in. Every visit after that is a lock screen.

Two-factor auth (TOTP) is optional, off by default, and lives under
**Settings → Security** — enroll by scanning the QR code with any
authenticator app, and it's required at every login from then on.

## The apps

- **Terminal** — a real shell (via `node-pty`) on the container, over an
  authenticated WebSocket. Not xterm.js pointed at nothing; an actual PTY.
- **Files** — browses and edits the real `imbatranim` home directory.
- **System Monitor** — live CPU, RAM, disk, and process list, for real.
- **Sticky Notes, Todo, Bookmarks, Notepad** — the small stuff that makes a
  desktop feel like yours.
- **Settings** — theme, accent color, and the TOTP enrollment above.

All of it runs as the unprivileged `imbatranim` user — no sudo, by design.

## Deploying on a VPS with HTTPS

The container itself only ever speaks plain HTTP; TLS is meant to be
terminated by a reverse proxy in front of it (Caddy gets you automatic
Let's Encrypt certs in about four lines). The full recipe — the Caddyfile,
the env vars to flip (`COOKIE_SECURE`, `TRUST_PROXY`), and why built-in TLS
was rejected — lives in [infrastructure/README.md](infrastructure/README.md).
Don't expose the plain-HTTP port directly to the internet; put the proxy in
front of it first.

## Data & backup

Everything that makes the container "yours" — your password hash, your
notes, your files — lives under `/home/imbatranim` inside the
`imbatranim-home` named Docker volume, not inside the container's writable
layer. Delete and recreate the container as often as you like; the volume
is what persists.

Back it up with a single tarball, written to the current directory:

```bash
docker run --rm -v imbatranim-home:/home/imbatranim -v "$(pwd)":/backup \
  alpine tar czf /backup/imbatranim-home-backup.tar.gz -C / home/imbatranim
```

Restore it into a fresh volume the same way, in reverse (`tar xzf` instead of
`czf`, extracting into the mounted volume).

## FAQ

**Is it safe to expose to the internet?**
It's designed for it: a single user, argon2id-hashed password, sessions in
an `httpOnly`/`SameSite=Lax` cookie, per-IP rate limiting with exponential
backoff on login, optional TOTP, and an Origin check on every state-changing
request. Put it behind the documented HTTPS reverse proxy (see above) — the
app itself never terminates TLS.

**What's the user / no-sudo story?**
Everything inside the container — the shell you get in Terminal, the
process that serves the desktop — runs as `imbatranim`, an unprivileged
user created in the image. There's no sudo available by default; the
container is not meant to be run as root.

**How do I reset my password if I forget it?**
There's currently no in-app "forgot password" flow — first-run setup is
one-time and intentionally refuses to run again while an account exists (no
silent password reset). If you're locked out, the honest path is: stop the
container, delete the database file inside the `imbatranim-home` volume
(or the whole volume, if you don't need what's in your home directory
either), and start it again — the setup wizard will run once more. Back the
volume up first if you want to keep your files (see Data & backup above).

## Screenshots

![Desktop](docs/screenshots/desktop.png)
![Terminal](docs/screenshots/terminal.png)
![Files](docs/screenshots/files.png)
![System Monitor](docs/screenshots/system-monitor.png)

*(Drop your own PNGs into `docs/screenshots/` with these filenames and
they'll show up here.)*

## Developing

The repo is an npm workspace (`apps/backend`, `apps/frontend`) with
[Turborepo](https://turborepo.dev) as the task runner — one install, one
lockfile, one entry point for every task:

```bash
npm install        # once, at the repo root — installs both apps
npm run dev        # Nest watch (:3001) + Vite HMR (:5173), in parallel
npm run build      # builds both apps (cached — a second run is instant)
npm run lint       # lints both apps
npm run test       # backend test suite
npm run format:check
```

The same works containerized: the compose dev profile
(`docker compose -f infrastructure/docker-compose.yml --profile dev up`)
runs `turbo dev` inside the image with your `apps/` bind-mounted for HMR.

## Project knowledge

Architecture, locked decisions, and work briefs live in
[corpus/](corpus/index.md), including the pivot history from this repo's
earlier ISO-based era.
