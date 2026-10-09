# Getting started

How to run ImbatranimOS, claim it on the first visit, and work on the code.

## Prerequisites

- Docker with Compose v2, to run it. Everything is built from this repository; there is no published image.
- To work on the code: Node 24.14.1 (see `.nvmrc`) and npm 11.11 or later, plus Docker for the dev container.

## Run it with Docker

```bash
git clone https://github.com/gandolh/ImbatranimOS.git
cd ImbatranimOS
docker compose -f infrastructure/docker-compose.yml up imbatranimos
```

The first run builds the image (Alpine and Node, with the desktop and the API in one container) and starts it. Open <http://localhost:8080>.

The compose file publishes two ports, both bound to `127.0.0.1` only:

| Port | What answers there |
|---|---|
| 8080 | The desktop and the API |
| 8081 | The Browser app's proxy origin. Pages the Browser shows are served from here, never from the desktop's origin |

Your files live in a named Docker volume, `infrastructure_imbatranim-home` (Compose prefixes the volume with the folder the compose file is in). Delete and recreate the container as often as you like; the volume is what persists.

Without Compose, build and run the image yourself:

```bash
docker build -f infrastructure/Dockerfile --target prod -t imbatranimos .
docker run -p 127.0.0.1:8080:8080 -p 127.0.0.1:8081:8081 -e BROWSER_PROXY_PORT=8081 \
  -v imbatranim-home:/home/imbatranim imbatranimos
```

This volume is called `imbatranim-home`, without the prefix. Leave out `-p 127.0.0.1:8081:8081 -e BROWSER_PROXY_PORT=8081` to run without the Browser app. Drop the `127.0.0.1:` prefixes only if you mean to expose the plain-HTTP ports to your network.

## The first visit

The first screen is **Set up this machine**, not a sign-in form. There is no default password. Choose a name and a password of at least 10 characters and you're in. Every visit after that asks for the password.

If other people can reach the machine before you claim it, start it with `SETUP_TOKEN=<something only you know>`. Setup then asks for that token too, so nobody else can claim it first. With Compose, put the line in `infrastructure/.env`, which the compose file reads if it exists.

**Cover screen** in the Start menu hides the desktop while you step away. It is not a lock: anyone at the machine can uncover it. To end the session, use **Log off**.

This sign-in is the only one in every setup: standalone, behind a reverse proxy on a shared domain, and on the server ISO.

## Put it on the internet

The container speaks plain HTTP only. Put a reverse proxy in front of it to terminate TLS; Caddy does Let's Encrypt certificates in about four lines. Never expose the plain-HTTP port to the internet directly.

The recipe, the `TRUST_PROXY` and `SETUP_TOKEN` settings, and the reasons built-in TLS was rejected are in [infrastructure/README.md](../infrastructure/README.md). The Browser app needs its second port published as a site of its own; that is in the same file.

What protects an exposed machine: a single owner, an scrypt-hashed password, a session in an `httpOnly`, `SameSite=Lax` cookie (only a hash of it is stored), per-address backoff on failed sign-ins, the optional setup token, and an Origin check on every state-changing request. There is no two-factor sign-in. If the machine shares a domain with other apps, a script on any of them can send requests your browser signs with this session, so share the origin only with code you trust.

## Develop

```bash
npm install          # once, at the repo root: one lockfile for every workspace
npm run dev          # the dev container: docker compose ... --profile dev watch
```

`npm run dev` builds the `dev` image and runs `turbo dev` inside it: Nest in watch mode on port 3001, Vite with hot reload on <http://localhost:5173>, and the Browser's proxy origin on 3002. Compose `watch` syncs your edits from `apps/`, `packages/` and `marketplace/` into the container. A change to `package.json`, the lockfile, `turbo.json` or the Dockerfile rebuilds the image instead.

The dev container keeps its home in its own volume and has a fixed owner for local development. The name and password are in [infrastructure/README.md](../infrastructure/README.md#the-dev-containers-sign-in).

The host needs Node only for the editor, eslint and tsc. `npm run install:tooling` (`npm install --ignore-scripts`) skips compiling `better-sqlite3` and `node-pty`, so the host needs no C toolchain.

`npm run dev:local` runs `turbo dev` on the host instead. It needs the full native build, and it runs as your own user: Files opens your real home folder, the Terminal is your own shell, and System Monitor lists your host's processes. The database defaults to `data/db.sqlite` at the repo root. Prefer the container.

### Scripts

All run from the repo root through Turborepo.

| Command | What it does |
|---|---|
| `npm run build` | Builds the backend and the desktop (cached; a second run is instant) |
| `npm run lint` | Lints every package |
| `npm run typecheck` | Typechecks every package |
| `npm test` | Every package's unit tests, plus the backend's end-to-end suite |
| `npm run format:check` | Prettier check across the packages |
| `npm run docs` | Builds the documentation site in `apps/docs` (corpus pages plus the generated API reference) |
| `npm run version:bump -- --stage` | Bumps the minor version; the project runs it before each commit |

To add an app to the desktop, see [adding-an-app.md](adding-an-app.md).

## The server ISO (planned)

Docker is the supported way to run ImbatranimOS. The bootable ISO is changing direction: instead of a kiosk with a fullscreen browser, it will be a plain Alpine Linux server image with ImbatranimOS installed, reached from other machines on your network over HTTPS and the same sign-in. That work is deferred. The [`iso/`](../iso/README.md) folder still builds the earlier kiosk variant.
