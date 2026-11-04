# Brief 37 — Production gets its own Compose profile

## Context

`npm run dev` runs `docker compose --profile dev watch` with no service named,
and Compose starts every service that has no profile. The production service
`imbatranimos` has none, so the first `npm run dev` on a fresh machine builds
the production image too (Nix, the native addons, the desktop's production
build) and then starts a production container on 8080 beside the dev one, with
its own home and Nix volumes. Found while building brief 22 (2026-11-03).

The owner chose on 2026-11-04 to give production a profile of its own, rather
than have `scripts/dev.mjs` name the dev service: each service then starts
only when its profile is asked for.

## Spec

1. `infrastructure/docker-compose.yml`: `imbatranimos` gets `profiles: ["prod"]`.
2. Every place that starts production names the profile: the README's
   `docker compose -f infrastructure/docker-compose.yml up imbatranimos`, the
   infrastructure README, docs pages and any script that brings it up. Check
   how vps-deploy's `imbatranim-os` stack starts the container; if it runs
   this compose file without a profile, say so in the outcome as an owner step
   for vps-deploy (this brief doesn't edit vps-deploy).
3. `npm run dev` starts the dev container only. A machine with no production
   image builds nothing for production.

## Must preserve

- The dev watch behaviour from brief 22 (version-free copies, no rebuild on a
  version bump).
- The production service's volumes and their names, so an existing install
  keeps its home and Nix store.

## Acceptance

- `docker compose -f infrastructure/docker-compose.yml config --services`
  with no profile lists no service; with `--profile dev` only `dev`; with
  `--profile prod` only `imbatranimos`.
- The README's production command, run as written, starts production.

## Files you OWN

- `infrastructure/docker-compose.yml`
- `README.md`, `infrastructure/README.md`, docs that name the start command
- `scripts/dev.mjs` only if it needs to change
