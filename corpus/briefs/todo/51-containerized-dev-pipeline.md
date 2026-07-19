# Brief 51 — Containerized dev pipeline (compose watch) + Dockerfile de-stale

Status: **todo** · Net-new (grilled 2026-07-19). **MEDIUM.** Touches
`infrastructure/Dockerfile`, `infrastructure/docker-compose.yml`, and root
`package.json` scripts. No security review (dev tooling), but the **prod path
must stay byte-for-byte behaviourally intact**. Unblocks brief 50 (a new
add-on must actually install in the image).

## Problem

`npm run dev` runs host `turbo dev`, so contributing needs the full host
toolchain (Node + native build tools for `better-sqlite3`/`node-pty`). The
goal: **everything contained** — edit on the host path, but install/build/run/
watch happen in the container; host dependency reduced to Docker (+ Node/npm
for editor IntelliSense only). Two blockers today:

1. The compose `dev` service keeps container `node_modules` from being shadowed
   via a **hand-listed set of anonymous volumes** — stale: **7 of ~24**
   add-ons ([`docker-compose.yml`], the bookmarks/file-manager/notepad/repl/
   sticky-notes/system-monitor/todo list). Every unlisted add-on's
   `node_modules` is shadowed to empty. Compose volumes can't glob — which is
   *why* the list is manual and rots.
2. The **Dockerfile has the same stale list** in its `deps`
   (`Dockerfile:22-28`) and `proddeps` (`Dockerfile:49-55`) stages — only 7
   add-on `package.json`s are COPYed before `npm ci`. With a root lockfile
   referencing all workspaces, `npm ci` needs every workspace manifest present,
   so the image can't cleanly install deps for the other 17 add-ons + any new
   one. "Everything's in the container" is currently **false**.

## Decisions (grilled 2026-07-19)

- **`npm run dev` → `docker compose -f infrastructure/docker-compose.yml
  --profile dev watch`.** Keep **`dev:local` = `turbo dev`** as the host
  escape hatch. (True zero-host entry is the raw compose command / a
  `make dev`; the npm alias is convenience — Node-on-host is accepted, below.)
- **HMR via Docker Compose `watch`** (`develop.watch`), replacing the bind
  mount + hand-listed anonymous volumes entirely: `action: sync` for
  `../apps` → `/app/apps` with `node_modules` ignored (container owns deps);
  `action: rebuild` on `package-lock.json` / `Dockerfile` / root
  `package.json`. Scales to any add-on count — no per-add-on enumeration ever
  again. Watch syncs into the container's real FS, so container-side inotify
  fires normally — **more reliable on WSL2** than bind-mount propagation.
- **De-stale the Dockerfile.** Fix `deps` + `proddeps` so every workspace
  installs. Preferred: `COPY apps ./apps` **before** `npm ci` (always correct;
  trades the install-layer cache on source change), OR generate the
  manifest-COPY list from the workspace. Must not silently omit add-ons — this
  is the actual blocker to "contained," more than the compose config.
- **Host tooling = Node/npm only, via `npm install --ignore-scripts`** (add an
  `install:tooling` script). Skips native compilation of `better-sqlite3`/
  `node-pty`, so **no `python3`/`make`/`g++` on the host**; still installs all
  JS + `.d.ts`, so editor IntelliSense/eslint/tsc are complete. Execution
  stays in the container, so the uncompiled `.node` binaries never matter.
  Consistent with brief 50's Scramjet-as-prebuilt-dist (no Rust/WASM on host
  either). **Caveat to document:** host-run paths (`dev:local`, `backend#test`
  opening sqlite) still need the *real* compile — `--ignore-scripts` is
  editor-only. **Dev Containers was rejected** in favour of this host install.
- **WSL2 HMR fallback:** if HMR still goes quiet, set Vite
  `server.watch.usePolling` — don't pre-optimize.

## Fix

**`infrastructure/docker-compose.yml`** (`dev` service): drop the `../apps`
bind mount + the anonymous-volume list; add a `develop.watch` block (sync
`../apps`→`/app/apps` ignoring `**/node_modules/**`; rebuild on lockfile/
Dockerfile/root package.json). Keep the `imbatranim-home-dev` volume and the
two dev ports.

**`infrastructure/Dockerfile`** (`deps` + `proddeps`): de-stale the manifest
COPY so all workspaces install (copy-all-before-`npm ci`, or generate the
list). Leave the `prod` target's runtime output unchanged.

**root `package.json` scripts:** `dev` → compose watch; add `dev:local` =
`turbo dev`; add `install:tooling` = `npm install --ignore-scripts`.

Update `infrastructure/README.md` (the dev workflow + the Node/npm-only
tooling note) and the corpus.

## Must preserve (regression surface)

- **The `prod` target/image is unchanged** — one `:8080` port, slim, no
  compiler, runs as `imbatranim`. `docker compose up imbatranimos` still
  builds + serves.
- The dev image still runs as the unprivileged `imbatranim` user; dev home
  volume retained.
- `turbo build/typecheck/lint/test` stay green.
- No new *runtime* dependency (this is build/dev plumbing only).

## Verify bar

- `docker compose -f infrastructure/docker-compose.yml --profile dev watch`
  brings up Nest `:3001` + Vite `:5173`; editing an add-on **not in the old
  7-list** (e.g. `calculator`) reflects via HMR — proves both the de-stale and
  the sync.
- On a host with **only Node + npm**, `npm run install:tooling` succeeds
  (no native compile) and yields working TS IntelliSense in the editor.
- `docker compose ... up imbatranimos` (prod) still builds and runs unchanged.
- `turbo typecheck`, lint/format, `backend#test`, `turbo build` green.

## Invariants

Lightweight (dev-only; prod image size untouched). Build-from-source (compose/
Dockerfile only; no registry/CI promise). Auth n/a (dev tooling). No prod
behaviour change — a decisions.md revisit is not required, but log the pivot
of the default `dev` entry.

## Out of scope

VS Code Dev Containers config (rejected), CI, image registry, changing the
prod runtime or ports, and the Browser add-on itself (brief 50).
