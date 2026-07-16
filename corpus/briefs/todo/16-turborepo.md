# Task 16 — Integrate Turborepo as the monorepo task runner

## Context

The repo has two apps (`apps/backend` NestJS, `apps/frontend` React/Vite) but
**no workspace setup at all**: there is no repo-root `package.json`, and three
independent `npm ci` runs happen today — `apps/`, `apps/backend/`, and
`apps/frontend/`, each with its own lockfile.

**Verified 2026-07-16 (grilling):** `apps/package.json` is *partially
load-bearing*. The frontend imports `tailwindcss` (`src/index.css`) and
`@tailwindcss/vite` (`vite.config.ts`) which are declared **only** in
`apps/package.json` — the build works today purely via Node's upward
`node_modules` resolution (a phantom-dependency accident from the fork). Its
other three deps (`@tanstack/react-router`, `react-hook-form`, `xterm`) are
imported nowhere in either app.

Every cross-app task (build both, lint both, test both) currently requires
`cd`-ing into each app, including in
[infrastructure/Dockerfile](../../../infrastructure/Dockerfile) (three
sequential `npm ci` + two builds) and the dev CMD's `& … & wait` shell hack.
Turborepo gives one entry point at the root, task-graph caching, and parallel
execution.

Constraint from [decisions.md](../../wiki/decisions.md): the repo layout
(`apps/frontend`, `apps/backend`, `infrastructure/`) is locked — Turbo layers
on top, no directory moves.

## Decisions (grilled 2026-07-16 — do not relitigate)

- **npm workspaces**, not pnpm/bun. Least churn, matches the fork; the single
  root lockfile fixes the phantom-dep problem well enough.
- **Prod image stays backend-only** via workspace-scoped install:
  `npm ci --omit=dev --workspace=backend` in the proddeps stage. NOT plain
  root `npm ci --omit=dev` (would pull react etc. into the prod image), NOT
  `turbo prune --docker` (rework deferred until it earns its keep).
- **`turbo dev` everywhere**: the dev image CMD becomes `npx turbo dev`,
  replacing the `&`-shell. One way to start dev, in and out of docker.
- **Local cache only.** No remote caching, no CI workflow in this brief
  (repo has no CI; revisit with brief 15).
- Unused deps `@tanstack/react-router`, `react-hook-form`, `xterm` are
  **dropped**, not rehomed — reinstall when a future brief needs them.

## Files you OWN

- `package.json` (new, repo root) — workspaces + turbo + root scripts
- `package-lock.json` (new, repo root) — single workspace lockfile
- `turbo.json` (new, repo root) — task pipeline
- `.gitignore` — add `.turbo/`
- `apps/package.json`, `apps/package-lock.json` — delete (after rehoming, below)
- `apps/backend/package.json`, `apps/frontend/package.json` — dep rehoming +
  script tweaks only; delete both per-app `package-lock.json` files
- `infrastructure/Dockerfile`, `infrastructure/docker-compose.yml` — adapt
  install/build/dev steps to the workspace + turbo
- `README.md` — update the dev-commands section

## Files you must NOT touch

- `apps/backend/src/**`, `apps/frontend/src/**` — no source changes
  (`vite.config.ts` and configs may be touched only if a hoisting path breaks)
- `infrastructure/entrypoint.sh`
- `corpus/**` other than the completion bookkeeping when the brief lands

## What to do

1. **Rehome the phantom deps.** Add `tailwindcss` and `@tailwindcss/vite` to
   `apps/frontend` devDependencies (versions as in `apps/package.json` today:
   `^4.2.4` both). Do not carry over the three unused deps.
2. **Create the npm workspace.** Repo-root `package.json`:
   `"workspaces": ["apps/backend", "apps/frontend"]`, `private: true`, `turbo`
   as a devDependency (caret range, consistent with the repo), root scripts
   `build` / `lint` / `test` / `dev` / `format:check` = `turbo <task>`.
   Delete `apps/package.json`, `apps/package-lock.json`, `apps/node_modules`,
   and both per-app lockfiles; `npm install` at the root for the single
   lockfile. Sanity-check the native modules (`better-sqlite3`, `node-pty`)
   and the Nest CLI under hoisting.
3. **Add `turbo.json`.** Tasks: `build` (frontend outputs `dist/**`; backend
   outputs `dist/**`), `lint`, `test`, `format:check` (add the script to
   backend — it only has write-mode `format` today), and `dev`
   (`persistent: true`, `cache: false`). No cross-app `dependsOn` — the apps
   are independent at build time; the Dockerfile composes their outputs.
4. **Update the Dockerfile.**
   - deps/builder stages: copy root `package.json` + root lockfile + both app
     `package.json`s first (layer caching), one `npm ci` at `/app`, then
     `npx turbo build` (frontend still built with `VITE_API_URL=/api`).
   - proddeps stage: `npm ci --omit=dev --workspace=backend`; keep the
     existing native-module pruning. Note hoisting puts modules in
     `/app/node_modules` — the prod-stage COPY paths and the Nest
     `node dist/main` working dir must be checked against that.
   - dev target: CMD `npx turbo dev` (Vite still `--host 0.0.0.0`, via the
     frontend `dev` script or turbo passthrough).
5. **Update docker-compose dev profile.** The anonymous-volume list
   (`/app/apps/node_modules`, per-app ones) must match the new layout: root
   `/app/node_modules` + any per-app `node_modules` npm still creates.
6. **Update README** dev commands (`npm install` once at root,
   `npm run dev` / `build` / `lint` / `test` via turbo).

## Acceptance

- `npm install` at the repo root is the only install step; `npm run build`,
  `npm run lint`, `npm run test` at the root run both apps via turbo.
- Running `npm run build` twice in a row: second run is a full cache hit
  ("FULL TURBO") with no recompilation.
- `docker build` succeeds for both `dev` and `prod` targets; the prod image
  contains **no frontend runtime deps** (no `react` in its `node_modules`)
  and stays within the ≤~400MB bar from the brief-09 revisit.
- Compose dev profile comes up with working Nest watch + Vite HMR under the
  `turbo dev` CMD.
- Backend e2e suite (`test:e2e`) still passes; frontend `tsc -b && vite build`
  still clean.
- `.turbo/` is gitignored; no per-app or `apps/` lockfiles remain in git.
