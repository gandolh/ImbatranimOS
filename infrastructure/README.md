# ImbatranimOS — infrastructure & deployment

One container is the computer: Alpine + Node, NestJS serves the built React
desktop **and** the API on a single port (`8080` in prod). This document
covers running it and the **HTTPS / identity** story (briefs 10 and 152).

## Run it

```bash
# Prod (the friend-run experience): desktop + API on :8080
docker compose -f infrastructure/docker-compose.yml up imbatranimos

# Dev (HMR): Nest watch + Vite, two ports (3001 API, 5173 desktop)
npm run dev     # = docker compose --profile dev watch
```

The first visit sets the owner's name and password (no default password ever
exists), and every visit after that asks for it. Set `SETUP_TOKEN` to make the
first claim also need a token only you know (see Identity below).

## Developing (contained — brief 51)

`npm run dev` runs **`docker compose … --profile dev watch`**: install, build,
watch and serve all happen in the container, and compose `watch` syncs your
edits from `apps/` and `packages/` into the container's own filesystem
(node_modules excluded — the container owns its deps). Dependency changes
(`package-lock.json`, root `package.json`, `turbo.json`, the Dockerfile)
trigger an image rebuild instead of a sync. There are no bind mounts and no
per-add-on volume list to keep in sync — adding an add-on needs no
infrastructure edit.

The host needs **Docker plus Node/npm for editor IntelliSense only**:

```bash
npm run install:tooling   # npm install --ignore-scripts — no python3/make/g++
```

`--ignore-scripts` skips the native compilation of `better-sqlite3`/`node-pty`,
so the host never needs a C toolchain; all JS and `.d.ts` still install, which
is what the editor, eslint and tsc read. Caveat: host-run paths that _execute_
those modules (`npm run dev:local`, `backend`'s tests) need the real compile
— `install:tooling` is editor-only. `npm run dev:local` (`turbo dev` on the
host) remains as the escape hatch for a host with the full toolchain.

### The dev container's sign-in

The dev container runs the same sign-in as every other setup. Its owner is:

- name: `Developer`
- password: `Testing1234#`

**This is the password for local development only. Do not use it on any
other environment.** It lives in the dev volume (`imbatranim-home-dev`), so a
fresh volume asks you to set up the machine again; use the same password so
this stays true.

## HTTPS decision: reverse-proxy TLS (not built-in)

**Decision: terminate TLS in a reverse proxy (Caddy recommended), not in the
app.** Rationale:

- Keeps the single-container story simple — no cert storage, ACME client,
  renewal cron, or privileged :443 bind inside a container that runs as the
  unprivileged `imbatranim` user (no sudo, invariant of the project).
- Caddy does automatic Let's Encrypt certs + renewal in ~4 lines and is the
  natural front door for an internet-exposed box.
- The app stays plain-HTTP internally, so **LAN / localhost use needs no TLS
  at all** — you just open `http://<host>:8080`.

Built-in TLS was considered and rejected: it would drag a cert lifecycle and
either a root-capable bind or extra capabilities into the runtime image, for
no benefit over a 4-line proxy.

### Caddy recipe

See [`Caddyfile.example`](./Caddyfile.example). Minimal form:

```caddyfile
os.example.com {
    reverse_proxy imbatranimos:8080
}
```

Caddy provisions and renews the certificate automatically. Point it at the
container (same Docker network) or at `localhost:8080`.

### Behind an HTTPS proxy

The app defaults to **plain-HTTP-safe** settings so LAN use works with zero
config, and nothing needs switching when a TLS proxy fronts it: the local
session cookie is marked `Secure` whenever the proxy reports the browser used
HTTPS (`X-Forwarded-Proto`). `COOKIE_SECURE` and `SESSION_TTL_HOURS` no longer
exist.

| Env var       | Default | Effect |
|---------------|---------|--------|
| `TRUST_PROXY` | `false` | Trusts `X-Forwarded-*` for `req.ip`. Leave it off behind Caddy, which appends to `X-Forwarded-For`, so a client could forge its address. With it off, every client shares the proxy's address and therefore the sign-in backoff. |
| `SETUP_TOKEN` | unset   | When set, claiming an unclaimed machine also needs this token. |

## Identity (what ships)

One sign-in, the machine's own (brief 152; the only one since brief 157, in
the estate too). A standalone run, a friend's install, the `gandolh.ro`
deploy and the server ISO all use it.

- **A single owner**, stored in SQLite (`local_owner`), with the password
  hashed with **scrypt** (`node:crypto`, so no native module). No default
  password: the first visit creates it, optionally gated by `SETUP_TOKEN`.
- **Sessions:** a random token in an `httpOnly`, `SameSite=Lax` cookie
  (`imb_session`). Only its SHA-256 is stored server-side, and a session
  lasts 30 days. Log off ends it. Changing the password ends every other
  session, and a restore from backup ends them all.
- **Backoff:** in memory, per client address. The first 5 failures are free,
  then the wait doubles from 1 s, capped at 15 min. It resets on a
  successful sign-in and on restart.
- No two-factor.
- **CSRF:** the `SameSite=Lax` cookie **plus** an Origin check on all
  state-changing requests (POST/PUT/PATCH/DELETE). A present `Origin` must
  match the request host or the configured `FRONTEND_URL`. An absent Origin
  (same-origin GET, non-browser clients) is allowed.
- **Shared origin, accepted risk:** on a domain shared with other apps (the
  deploy at `gandolh.ro/imbatranim-os`), a script on a sibling app can send
  requests to `/imbatranim-os/api/*` and the browser attaches `imb_session`.
  An XSS on a sibling while the owner is signed in reaches the terminal. The
  owner accepted this on 2026-10-06 because every app on that origin is the
  owner's own code under `script-src 'self'`.
- **Every** API route needs a session except `GET /api/identity`, the
  setup/sign-in/sign-out routes, the `/health` check and the static desktop
  assets. The Terminal's WebSocket is authenticated by the same check.
- **Cover screen** hides the desktop but is not a lock.
- **Old variables:** an environment that still sets `WARD_*` (from before
  brief 157) boots normally and logs one line naming them as ignored.

## The Browser's second port (brief 50)

The Browser app shows real websites through the machine: Scramjet rewrites
each page, and a Wisp relay in the backend carries its traffic. Proxied pages
run in a frame on an origin of their own, **never the desktop's**: there, a
page that escaped the rewriter could act with your session and open a shell.
So the backend listens on a second port, `BROWSER_PROXY_PORT` (compose: 8081
prod, 3002 dev), which serves only the proxy's fixed files and the relay.

- **Unset, the Browser is off** and says so; nothing else changes.
- The proxy origin is `FRONTEND_URL`'s scheme and host on that port. Open the
  desktop at the address `FRONTEND_URL` names: the proxy page lets only that
  origin frame it.
- **Behind a TLS proxy**, give the second port its own site or port and set
  `BROWSER_PROXY_ORIGIN` to where browsers reach it, for example
  `https://web.example.com`. It must differ from the desktop's origin (the
  backend refuses to start otherwise). Proxy WebSockets to it too: the relay
  is `/wisp/`.
- The Browser needs a secure context for its service worker: HTTPS, or
  `localhost`. Over plain HTTP on a LAN address it reports that and stops.
- **Egress:** the relay connects only to public unicast addresses on ports
  80, 443, 8080 and 8443, judged after DNS resolution on every answer. No
  RFC 1918, loopback, link-local (cloud metadata), CGNAT or IPv6 local
  ranges. This is stricter than the REST client on purpose (decisions:
  brief 43 vs brief 50).
- **Sign-ins:** proxied sites' cookies are kept by the machine, AES-GCM
  encrypted in the database, with the key in
  `.imbatranim/browser-profile.key` beside it. Backups leave the key out, so a
  backup carries only ciphertext; restoring one elsewhere signs the Browser
  out of every site.

## Native modules note

`better-sqlite3` and `node-pty` are native addons, compiled in the `deps` /
`proddeps` stages, which carry `python3 make g++`. The final prod image ships
the compiled `.node` binaries and no compiler. The password hash needs none:
scrypt is built into Node.
