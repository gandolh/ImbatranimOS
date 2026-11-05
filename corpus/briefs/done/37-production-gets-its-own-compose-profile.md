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

## Outcome (2026-11-05)

Done in `79cb518` (1.137.0).

1. `imbatranimos` has `profiles: ["prod"]`, with a comment on why.
2. **The start commands stay as written.** Every one names the service
   (`up imbatranimos`), and Compose turns a named service's profile on by
   itself, so the README, `docs/getting-started.md`, `docs/backup.md` and the
   infrastructure README needed no new flag. The infrastructure README now
   explains the two profiles, and getting-started says `npm run dev` never
   builds production.
3. **vps-deploy is unaffected; no owner step.** Its `imbatranim-os` stack
   (`ContainerService`) names the service in every compose call: `build
   imbatranimos`, `up -d imbatranimos`, `ps --format '{{.State}}'
   imbatranimos`, `logs --tail 40 imbatranimos`. Checked locally with Compose
   v5.6.1: `build` (dry run), `up -d`, `ps` and `logs` by name, with no
   `--profile`, all reach the service.

**Checked:**
- `config --services`: no profile lists nothing, `--profile dev` only `dev`,
  `--profile prod` only `imbatranimos`.
- The README's command, run as written (detached) against the existing
  `imbatranimos:1.0` image, started production: healthy, `/health` 200. Then
  `down`; the test's empty `infrastructure_imbatranim-nix` volume was removed.
- **Not run:** a fresh-machine `npm run dev` (it would build the dev image);
  the `config --services` result is what decides it.
