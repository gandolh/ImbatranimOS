# Task 09 — The computer: Alpine image, imbatranim user, one port, volume home

## Context

The container IS the product (decisions: Docker runtime, Alpine + Node,
single port, volume-backed home, no sudo). Depends on brief 08. This brief
turns the dev setup into the shippable computer.

Layout note (per brief 08 grilling): the Dockerfile lives under
`infrastructure/` (fork layout kept), not `image/`. The corpus's old
`image/` naming is superseded.

## Dual-mode target (locked in brief 08 grilling, 2026-07-16)

ONE multi-stage Dockerfile, two targets:
- **dev**: runs Nest (API/WS) + the Vite dev server (HMR) inside one
  container, TWO ports exposed. Full source + dev deps. This is the
  develop-with-HMR experience.
- **prod**: Nest serves the built Vite statics on ONE port, no Vite, no
  dev deps — the slim, friend-run image.

This amends decision 09's "one port / serve statics": that describes the
**prod** target specifically. `docker-compose` gets a dev profile
(target: dev) and a prod profile (target: prod).

## Files you OWN

- `infrastructure/Dockerfile` (multi-stage, `dev` + `prod` targets),
  `infrastructure/entrypoint.sh`
- `infrastructure/docker-compose.yml` (dev + prod profiles — evolve the
  fork's compose from brief 08's 2-container dev setup)
- Backend static-serving wiring (prod: Nest serves the built frontend on
  the same port as API/WS)
- README run instructions section

## What to do

1. Multi-stage build. Shared builder compiles frontend (`vite build`) and
   backend. `prod` target = node:lts-alpine + production deps + built
   statics, one port. `dev` target = source + dev deps, runs Nest + Vite,
   two ports, HMR.
2. Create user `imbatranim` (uid 1000, no sudo, login shell — pick sh or
   bash and record); `WORKDIR /home/imbatranim`; BOTH targets run as this
   user, not root.
3. `/home/imbatranim` declared VOLUME; SQLite DB path inside it (env from
   brief 08); first-run init (dirs, DB) idempotent in entrypoint.
4. Prod: one exposed port (8080) serving desktop + API + WebSockets.
   Dev: two ports (Nest + Vite HMR).
5. **Measure the PROD image** and record the size in wiki/status.md — the
   "does NestJS keep us near 100–150MB" question gets its answer; >~200MB
   triggers a formal revisit of the backend-language decision.

## Acceptance

`docker build --target prod -t imbatranimos infrastructure/` succeeds;
`docker run -p 8080:8080 -v imbatranim-home:/home/imbatranim imbatranimos`
serves the working desktop on localhost:8080 from a single port; the dev
profile brings up HMR on its own port; both run as imbatranim (not root);
data survives container delete + recreate via the volume; prod image size
recorded.

---

## Outcome (2026-07-16)

DONE (build-wise; size trips the revisit tripwire — see below). Delivered:
- One multi-stage `infrastructure/Dockerfile` with `deps` → `builder` →
  `proddeps` → `prod` and `dev` targets. Build context is the repo root.
- Backend now serves the built frontend in prod: conditional
  `ServeStaticModule` (gated on `STATIC_ROOT`), excludes `/api/{*path}` +
  `/health`, SPA index.html fallback. Verified: `/` serves the desktop,
  deep routes fall back, assets get correct MIME, `/api` + `/health`
  keep their handlers. Dev leaves `STATIC_ROOT` unset so Vite serves.
- Prod frontend built with `VITE_API_URL=/api` (same-origin).
- `imbatranim` user at uid 1000 (default `node` user dropped first);
  both targets run unprivileged. Volume `/home/imbatranim`; idempotent
  `entrypoint.sh` ensures DB/notes/configs dirs. DB at
  `/home/imbatranim/.imbatranim/db.sqlite`.
- Compose has a default `imbatranimos` (prod) service and a `dev` profile
  (source bind-mount + node_modules anon volumes + 2 ports for HMR).
- Verified end-to-end: `docker run -p 8080:8080 -v vol:/home/imbatranim`
  serves desktop + API on ONE port; runs as imbatranim; a written todo
  survives container destroy+recreate on the volume; better-sqlite3 and
  node-pty (real PTY spawn) both load in the image.

### Image size — REVISIT FLAG
Prod image measured **364 MB** (down from an initial 657 MB after cutting
the frontend's hoisted node_modules from the runtime and stripping native
build intermediates). This EXCEEDS the decision's ~150 MB target and its
>200 MB tripwire, so the backend-language decision (NestJS vs Go) is
formally up for revisit — pending a user call (see wiki/open-questions.md
+ wiki/decisions.md). Breakdown: ~140 MB node:22-alpine base + ~130 MB
backend node_modules (node-pty prebuilds ~40 MB, better-sqlite3, rxjs,
libphonenumber-js via class-validator, zod, lodash, @nestjs) + built app.
The ~150 MB target is unreachable with Node+Nest; realistic floor ~300 MB.
