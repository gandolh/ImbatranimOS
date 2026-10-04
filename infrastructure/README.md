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

With no `WARD_*` variables, the first visit sets the owner's name and password
(no default password ever exists), and every visit after that asks for it. Set
`SETUP_TOKEN` to make the first claim also need a token only you know. With all
three `WARD_*` variables set, sign-in is Ward's instead (see Identity below).

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

Two modes, chosen by the environment (decided 2026-10-04, brief 152):

- **Local sign-in** (no `WARD_*` set): what a standalone run, a friend's
  install and the server ISO use.
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
- **Ward** (all three `WARD_*` set): the estate's single sign-in. The browser's
  `ward_session` cookie is verified against Ward's keys and introspected. An
  account needs an `imbatranim-os` grant. The local routes answer 404.
- **Either way:**
  - **CSRF:** the `SameSite=Lax` cookie **plus** an Origin check on all
    state-changing requests (POST/PUT/PATCH/DELETE). A present `Origin` must
    match the request host or the configured `FRONTEND_URL`. An absent Origin
    (same-origin GET, non-browser clients) is allowed.
  - **Every** API route needs a session except `GET /api/identity`, the local
    setup/sign-in/sign-out routes, the `/health` check and the static desktop
    assets. The Terminal's WebSocket is authenticated by the same check.
  - **Cover screen** hides the desktop but is not a lock.

## Native modules note

`better-sqlite3` and `node-pty` are native addons, compiled in the `deps` /
`proddeps` stages, which carry `python3 make g++`. The final prod image ships
the compiled `.node` binaries and no compiler. The password hash needs none:
scrypt is built into Node.
