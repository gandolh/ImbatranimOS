# Task 17 — Restructure: backend / core / add-ons

## Context

User-requested restructure (2026-07-16): organize the codebase as
**backend**, **core** (the desktop shell and main OS functions), and
**add-ons**, one directory per app, so apps can be added/removed without
touching the OS.

Current state (verified 2026-07-16):

- `apps/frontend/src/modules/<app>` — auth, bookmarks, file-manager,
  notepad, repl-interpreter, settings, sticky-notes, todo — with the
  desktop shell in `src/shared/` (components, registry, store, commands,
  intents).
- **The dependency direction is backwards today**: the shell statically
  imports every app — `shared/registry/registry.tsx` imports all seven app
  components into `APP_REGISTRY`, and `shared/commands/bookmarksSource.ts`
  / `recentFilesSource.ts` import module APIs directly. The restructure
  must invert this seam, not just move folders.
- `apps/backend/src/modules/` mirrors the app list (auth, bookmarks, files,
  notes, repl, sticky-notes, system, todos) — **stays as is** (see
  decisions).

**Decision revisit:** supersedes the locked "keep the fork's repo layout"
entry in [decisions.md](../../wiki/decisions.md); the user explicitly
requested the new structure. Amend `decisions.md` when this brief lands.

**Sequencing:** [brief 16 (turborepo)](16-turborepo.md) lands **first** —
this brief assumes npm workspaces + turbo exist and updates their globs.

## Decisions (grilled 2026-07-16 — do not relitigate)

- **Roots: `apps/backend`, `apps/core`, `apps/add-ons/<app>`.** Everything
  stays under `apps/`; smallest blast radius on Dockerfile/compose paths.
- **One workspace package per add-on.** Each `apps/add-ons/<app>` has its
  own `package.json` (scope: `@imbatranim/<app>`) with `@imbatranim/core`
  (and react etc.) as peer/deps. The boundary is npm-enforced, not a
  convention. Chosen over folders+lint by the user.
- **Frontend-only add-ons.** The backend keeps its own `modules/` tree;
  the seam between an add-on and the backend is the HTTP API. No Nest code
  moves into add-on directories.
- **Core roster: shell + auth + settings.** Everything that opens in a
  window is an add-on — including the future real-OS apps (terminal,
  files, system monitor; briefs 11–13 will land as add-ons). Add-ons at
  migration time: bookmarks, file-manager, notepad, repl-interpreter,
  sticky-notes, todo.
- **Core is the Vite app + composition root.** `apps/core` hosts the Vite
  build. Exactly one file — `apps/core/src/manifest.ts` — may import
  add-on packages; it aggregates their exported manifests into the
  registry. Everywhere else, core must not import from add-ons
  (add-ons → core only). Add-ons ship raw TS (`main: src/index.ts`)
  compiled by core's Vite build via workspace resolution — no per-add-on
  build step; turbo runs typecheck/lint per package.

## Files you OWN

- `apps/frontend/**` → becomes `apps/core/**` + `apps/add-ons/<app>/**`
  (git mv history-preserving where possible)
- `apps/add-ons/<app>/package.json`, `tsconfig.json` (per add-on, extending
  a shared base)
- Root `package.json` workspaces glob + `package-lock.json`, `turbo.json`
  (post-brief-16 artifacts)
- `infrastructure/Dockerfile`, `infrastructure/docker-compose.yml` — path
  updates (frontend → core)
- `README.md`, `corpus/wiki/decisions.md` (layout entry amendment),
  completion bookkeeping
- New: add-on contract type in core (extended `AppConfig` → add-on
  manifest incl. optional command-palette sources)

## Files you must NOT touch

- `apps/backend/src/**` — backend structure is explicitly out of scope
- `infrastructure/entrypoint.sh` unless a path it references moves
- App component internals — this is a move + re-wire, not a rewrite

## What to do

1. **Define the add-on contract in core.** An add-on package exports a
   single manifest object: the existing `AppConfig` fields (id, name, icon,
   component, sizes…) plus optional integrations currently hard-wired in
   the shell (command-palette sources — bookmarks and notepad recent-files
   move into their add-ons).
2. **Create `apps/core`** from `apps/frontend` minus the app modules: shell
   components, window manager, store, intents, commands framework, lib,
   auth module, settings module, Vite/Tailwind config. Publishes its
   public surface (contract types, UI kit, hooks, store access) via package
   exports for add-ons to import as `@imbatranim/core`.
3. **Extract the six add-ons** — bookmarks, file-manager, notepad,
   repl-interpreter, sticky-notes, todo — each to
   `apps/add-ons/<app>/` with its own `package.json` +
   `tsconfig.json`, importing core's public surface only (no deep
   `../../shared/...` paths).
4. **Invert the registry.** `apps/core/src/manifest.ts` imports each
   add-on's manifest and builds `APP_REGISTRY`; delete the static imports
   in `shared/registry/registry.tsx` and the module-reaching command
   sources. Enforce "no add-on imports outside manifest.ts" (eslint
   no-restricted-imports or import boundary rule) so the exception is
   mechanical, not tribal knowledge.
5. **Update workspaces + turbo**: root glob →
   `["apps/backend", "apps/core", "apps/add-ons/*"]`; turbo tasks run
   lint/typecheck per add-on package; `build` stays core+backend.
6. **Update Dockerfile + compose** (frontend → core paths, per-add-on
   package.json COPY layers for `npm ci` caching), README dev docs.
7. **Amend `decisions.md`** (layout entry superseded, new structure
   recorded) + `log.md` entry.

## Acceptance

- Tree shows `apps/backend`, `apps/core`, `apps/add-ons/{bookmarks,file-manager,notepad,repl-interpreter,sticky-notes,todo}`,
  each add-on a workspace package named `@imbatranim/<app>`.
- `grep` proves no `apps/core` file other than `src/manifest.ts` imports
  from `@imbatranim/`-scoped add-on packages, and no add-on deep-imports
  core internals (only the exported surface); the eslint rule fails the
  lint task on violation.
- All seven desktop apps (six add-ons + settings in core) still open and
  function; auth flow intact.
- `npm run build` / `lint` / `test` green at root via turbo; both Docker
  targets build and run; compose dev profile (HMR) works with the new
  paths.
- Adding a new add-on requires: new directory under `apps/add-ons/`, one
  line in `manifest.ts` — nothing else in core changes (documented in
  README as the add-on how-to).
- `decisions.md` amended; brief 16 artifacts updated to the new globs.
