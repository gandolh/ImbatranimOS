# Brief 138 — Terminal upgrade handler: no crash, no held sockets, no secrets in the shell

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · BACKEND
(`apps/backend/src/modules/pty/pty.gateway.ts` + tests). Independent; land it
before brief 145, which edits the same file. Implement inline.

## Context

Three defects in the raw `'upgrade'` handler and the spawn path of
`apps/backend/src/modules/pty/pty.gateway.ts`.

1. **An unauthenticated TCP reset crashes the whole backend.** Node's HTTP
   server removes its own socket `'error'` listener before it emits
   `'upgrade'`. The handler (`:89-126`) then awaits `authorizeUpgrade(...)`
   (`:100-104`) — a JWKS fetch or a Ward introspection, up to a 5 s timeout —
   with no `'error'` listener on `socket`. If the client resets the connection
   in that window, the socket emits `ECONNRESET` with no listener, which throws.
   There is no `uncaughtException` handler, so the process exits and every
   terminal and request dies until the container restarts. Any `ward_session`
   value reaches this window; a token with an unknown `kid` forces a key fetch
   and widens it. The `ws` README's `noServer` example adds
   `socket.on('error', …)` before async authentication for exactly this reason.
   The sweep reproduced the crash with this handler shape on the repo's ws
   8.21.1 and Node 24.14.1 (`Error: read ECONNRESET … Unhandled 'error' event`,
   exit code 1).
2. **Upgrades for any other path are held open forever.** `:92` —
   `if (!isPtyUpgrade(req.url)) return;`. Once an `'upgrade'` listener exists
   Node no longer answers those requests itself; nothing writes a response or
   destroys the socket, and there is no other upgrade handler in the app (the
   comment says "there are none today"). Every `Upgrade: websocket` request to
   `/api/anything-else` pins a socket until the peer gives up — unauthenticated
   file-descriptor and memory exhaustion.
3. **Every shell inherits the backend's secrets.** `:146` — `env: process.env`.
   The terminal's environment includes `WARD_APP_KEY`, which
   `config/env.schema.ts` documents as "A SECRET: server-side only, never
   logged in full, never exposed to the frontend". Any grant-holder, and
   anything that drives their terminal, can `echo $WARD_APP_KEY`. The git
   module already spawns with a scrubbed environment (`git.service.ts:179`,
   `GIT_ENV`); the PTY does not.

## Files you OWN

- `apps/backend/src/modules/pty/pty.gateway.ts` — the upgrade handler and the
  `pty.spawn` options in `onConnection` only
- a new `apps/backend/src/modules/pty/pty.gateway.spec.ts` (brief 145 will
  extend it), and `apps/backend/test/pty.e2e-spec.ts`

## Files you must NOT touch

- `sweepRevoked` and the stored-cookie bookkeeping — brief 145 redesigns them.
- `pty-upgrade.ts` — its origin and grant checks are correct.

## What to do

1. First statement of the PTY branch: `socket.on('error', onSocketError)`
   (log at debug level, destroy the socket). Remove the listener immediately
   before `wss.handleUpgrade`, which installs its own. Keep it attached on the
   401 and 503 rejection paths until `destroy()`.
2. Non-PTY upgrades: write `HTTP/1.1 404 Not Found\r\n\r\n` and destroy. Leave a
   comment saying a future WebSocket endpoint must be dispatched from this same
   handler rather than a second `'upgrade'` listener.
3. Spawn with an explicit environment. Build it from `process.env` minus every
   `WARD_*` key (and any other name the config schema marks secret), keeping
   `HOME`, `USER`, `LOGNAME`, `SHELL`, `PATH`, `LANG`/`LC_*`, `TERM`, `TZ`. An
   allowlist is the stricter alternative; pick one and write the reason in a
   comment. Never mutate `process.env` itself.

## Must preserve

- Authentication before spawn; `MAX_SESSIONS` enforced before spawn; the raw
  `401`/`503` status lines on refusal (the Terminal's `closeReason.ts` relies
  on "closed without ever opening").
- The existing pty e2e tests (echo round-trip, two concurrent shells,
  no-cookie 401).

## Acceptance

- A test that opens a raw TCP connection, sends an upgrade to `/api/pty` while a
  fake `WardService.authenticate` holds a promise the test controls, destroys
  the client socket, then resolves authentication: the process survives, and a
  normal terminal still opens afterwards.
- A test that an upgrade to `/api/nope` receives a 404 status line and the
  socket closes.
- A test (or an e2e `env` round-trip) that `WARD_APP_KEY` is absent from the
  shell's environment while `HOME` and `PATH` are present.
- Backend unit + e2e green; `npx eslint` (without `--fix`) clean on the touched
  files.

## Out of scope

- Terminals being closed at token expiry — brief 145.
- A process-wide `uncaughtException` handler. The fix belongs at the source; a
  global swallow would hide the next one.

## Outcome (2026-10-03)

Done, in `pty.gateway.ts` only. `sweepRevoked` and `pty-upgrade.ts` are untouched.

1. The PTY branch attaches `onSocketError` first (debug log, `destroy()`) and removes it immediately before `handleUpgrade`. A socket already destroyed when Ward answers is dropped there, with no refusal written and no shell spawned.
2. A non-PTY upgrade gets `HTTP/1.1 404 Not Found` and is destroyed. The comment says a future WebSocket endpoint is dispatched from this handler.
3. `shellEnv(process.env)` is a copy without any `WARD_*` name. It is a **denylist**: the terminal is the user's workspace, and an allowlist would also strip what the image or operator set (`EDITOR`, locale, tool paths). The cost is that a new secret has to be added to it.

**Tests:**
- `pty.gateway.spec.ts` (new) runs a real HTTP server with a fake Ward whose answer the test holds. An RST (`resetAndDestroy`) during authentication, then release: a terminal still opens and echoes. An upgrade to `/api/nope` gets a 404 status line and is closed. On the old handler both fail; the first with `read ECONNRESET`.
- `pty.e2e-spec.ts` round-trips the environment: `WARD_APP_KEY` is empty in the shell, `HOME` and `PATH` are set, and the backend's own `process.env` keeps the key. It fails with `env: process.env`.
- Backend unit 406/406, e2e 121/121, typecheck and `npx eslint` clean on the touched files.

**Found, not fixed:** this brief's context says the git module spawns with a scrubbed environment. It does not: `git.service.ts` passes `extendEnv: true`, so git and every hook in a user's repository inherit `WARD_APP_KEY`. Captured as [todos/git-env-inherits-ward-secret.md](../../todos/git-env-inherits-ward-secret.md).
