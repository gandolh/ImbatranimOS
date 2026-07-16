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
