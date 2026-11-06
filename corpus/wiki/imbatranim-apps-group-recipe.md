---
summary: How to add an install group to imbatranim-apps (settled by brief 64 on 2026-11-06) - a folder in the root workspace, shared code, the descriptor's build commands and output paths, capabilities from the system calls, icons and retired ids. Read before briefs 75 and 76.
updated: 2026-11-06
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
