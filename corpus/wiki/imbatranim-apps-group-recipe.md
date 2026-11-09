---
summary: How to add an install group to imbatranim-apps (settled by brief 64 on 2026-11-06, extended by brief 75's Accessories on 2026-11-09) - a folder in the root workspace, shared code, the descriptor's build commands and output paths, capabilities from the system calls, icons and retired ids; then hooks, data in system.data instead of a backend module, the shared store that replaces react-query, the kit sync order and the OS's one-time move. Read before brief 76.
updated: 2026-11-09
---

# Recipe: a group in imbatranim-apps

Written from the handoff of brief 64, which built the Games group. The layout
choice and its measurements are in
[research-imbatranim-apps-layout.md](research-imbatranim-apps-layout.md); the
per-app checklist is its section 4.

## Where things go

- **One root workspace.** A group is a folder `<group>/` at the repo root, a
  workspace package named `@imbatranim-apps/<group>`. There is one root
  lockfile.
- **Apps** live at `<group>/apps/<id>/src/App.tsx`, each with an `App.test`
  that runs through `fencedSystem`.
- **The package** has a `build:os` script that runs `vite build`. Its
  dependencies are pinned to the versions the OS resolves; its dev
  dependencies are the build helper's toolchain, at the root's pins.
- **Shared code:** the Vite config calls
  `osBuildConfig({root, vendorDir, sharedDir})`, so the group finds the kit
  snapshot and the build helper at the repo root. The group also has a
  `tsconfig`, and the root wiring knows it: a `tsconfig` reference,
  `tsconfig.node` and the `vitest` globs.
- **The descriptor template** is `os/descriptor.template.json` in the group.

## The descriptor

In the OS catalog (`marketplace/<group>.json`), `schemaVersion` is 2 and:

- build: `npm ci --workspace=<group>`, then
  `npm run build:os --workspace=<group>`;
- output: `<group>/dist/os`; each app's entry is `<id>/app.mjs` and its styles
  `<id>/app.css`;
- **capabilities come from the `system` calls the app makes**, not from the
  old built-in. Games made no calls, but its fenced tests use hotkeys, so it
  needs `shortcuts`; check each app's tests the same way;
- the pin is the apps repo commit.

## On the OS side

- Add the icons to `ICONS` (`apps/core/src/shared/registry/marketplace.tsx`)
  and to the icon list in `marketplace/README.md`.
- Add to `RETIRED_APP_IDS` only if an app's id changes; a same-id move needs no
  pair.
- Delete the built-in's folder, its `manifest.ts` line and its lockfile
  entries, and fix the README and tour lines that name it as built in.
- Walk the install from a `file://` clone with
  `MARKETPLACE_ALLOW_LOCAL_REPOS=true`, and sync the dev container with
  deletes, since a plain sync leaves deleted add-ons behind.

## Apps with hooks and data (Accessories, 2026-11-09)

Learned moving Todo and Bookmarks (brief 75); brief 76 meets the same.

- **Sync the kit first, after committing any kit change.** `kit:sync` reads
  the OS's git objects, never its working tree, so commit the OS's kit
  change, then `npm run kit:sync -- <os-checkout> <commit>` in the apps repo.
  Bump the snapshot test's expected commit, and run Office's tests too: the
  whole kit moves under it.
- **No react-query.** Only React, React DOM and `@imbatranim/ui` are lent; a
  bundled `@tanstack/react-query` can't see the desktop's provider. The
  Accessories apps keep their query hooks' names and shapes over
  `accessories/shared/src/dataStore.ts`: one store per page shared by the
  window and the hooks, changes in turn, each file written with the version
  it read, a stale write reloaded and reapplied. Move it to
  `packages/shared/src` when a second group needs it.
- **The hooks** are exported by name from `App.tsx` (`Background`,
  `commandSources`); the root eslint config lets an `App.tsx` export more
  than components. A command source reads the app's folders through
  `ctx.data` (kit 1.6.0); it has no window and no `useSystem()`.
- **Tests:** `fencedSystem`'s `ALWAYS` has `data`, as the OS's does, and the
  fake system has an in-memory `data` seeded by `kind:path`
  (`appData: { 'data:todos.json': ... }`).
- **Capabilities follow the calls after the move**: Todo lost `http` once its
  module was gone.
- **The data moves on the OS side**, in `DataMovesService`
  (`apps/backend/src/modules/app-data/`): at every start, for each app whose
  tables remain, it writes the files as the app with
  `AppDataService.place` (no installed check; never over a file the app
  wrote), then drops the tables. A failure keeps the rows, logged. Add a
  move there and delete the module in the same commit.
