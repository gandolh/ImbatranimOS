# Brief 64 — Games install from imbatranim-apps

## Context

Minesweeper and Solitaire are the first apps to leave the image. They install
from imbatranim-apps as the Games group
([research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md)).
Promoted from the todo `games-install-from-imbatranim-apps`. They are the
cheapest move:
- 1,131 source lines and 319 test lines in `apps/add-ons/games`, one package
  with two manifests (`minesweeperManifest`, `solitaireManifest` in
  `src/index.ts`);
- no backend module and no `system` capability;
- from the kit they use only `Button`, `ScrollArea`, `Select`, `cn` and
  `useRegisteredHotkeys`;
- best times live in a zustand `persist` store under the key
  `imbatranimos:games` (`src/lib/statsStore.ts`).

Together they are 16 kB of the build. The point is to prove the path every
later move takes, and to settle how a group lives in the apps repo.

**The layout is the open part.** Office's build is anchored at the repo root.
`osBuildConfig` (`packages/shared/src/build/osBuild.ts` in the apps repo)
finds:
- apps under `<root>/apps`;
- the kit under `<root>/vendor/imbatranim-ui` (a `vendorDir` option exists);
- its helpers under `<root>/packages/shared/src`, which is hard-coded.

A group with its own lockfile in its own folder would import those helpers
from outside its `node_modules`, so `vite` wouldn't resolve.

The steps shared by every move are the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

Brief 63 (the repo is imbatranim-apps).

## Owner decisions (settled 2026-11-06)

1. The descriptor: id `games`, name "Games", a static `schemaVersion: 2` suite
   on the shared kit.
2. The layout: measure both of these on Games, and take the cheaper one that
   keeps Office building:
   - (a) one root workspace, where each group descriptor runs a scoped
     `npm ci --workspace=<group>` and builds that workspace;
   - (b) self-contained group folders, each with its own lockfile and the
     build helper as a `file:` package or a copy.
3. The ids stay `minesweeper` and `solitaire`. Pins, startup entries and best
   times come back on install, and no `RETIRED_APP_IDS` pair is needed.
4. The icons stay Bomb and Spade, as new `bomb` and `spade` entries in
   `ICONS` (`apps/core/src/shared/registry/marketplace.tsx`).

## What to do

1. **The layout spike**, in a scratch clone of the apps repo. Lay out Games
   both ways. For each, measure:
   - the install's `node_modules` size and time, and whether Office's
     dependencies came along;
   - the build's time and output size.

   Pick per decision 2 and put the numbers in the outcome.
2. **Port**, in the apps repo:
   - Minesweeper and Solitaire become kit apps exporting `App`;
   - engines, components, the stats store and tests come across unchanged,
     with the store key kept;
   - `zustand` becomes the group's own dependency, pinned to the version the
     OS resolves;
   - the build helper is parameterised where it hard-codes the root, so
     Office's output is unchanged;
   - `build:os`, tests and lint pass;
   - Games joins the README and corpus as the second group.
3. **Catalog**, in this repo: `marketplace/games.json`, with:
   - the manifests' names, descriptions and meta;
   - windows 340×440 (min 300×400) and 560×560 (min 460×460);
   - `multiInstance: false`, no capabilities;
   - a pin to the apps repo's commit, `minSystemVersion` 2.

   `bomb` and `spade` join `ICONS`.
4. **Remove the built-in:** `apps/add-ons/games`, its lines in
   `apps/core/src/manifest.ts`, the lockfile entries and any test that names
   the two.
5. **Walk** in the dev container, with the apps repo copied in as a
   `file://` repository and `MARKETPLACE_ALLOW_LOCAL_REPOS=true`:
   - before: pin Minesweeper, add it to startup, and record a best time;
   - after the built-in is gone, Start has no games, and the pin, startup
     entry and best time stay in place;
   - install Games: record its time and size under `~/.imbatranim/apps/`,
     check both play, and check the pin, startup entry and best time came
     back;
   - uninstall: both are gone again.
6. **Image bytes** before and after
   (`docker image inspect --format '{{.Size}}'`).
7. **Corpus:**
   - the layout call goes into
     [decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md)
     and the apps repo's decisions;
   - the research pages and the layout page's §4 checklist get the measured
     layout;
   - status and log in both repos.

## Files you OWN

- in imbatranim-apps: the Games group, the build helper's root handling,
  its README and corpus
- in this repo: `marketplace/games.json`, `ICONS`, `apps/add-ons/games/`
  (deleted), the two `manifest.ts` lines, `package-lock.json`, the corpus
  pages

## Files you must NOT touch

- Office's code and descriptor, beyond the build helper's root handling.
  Office's output must stay the same.
- The marketplace installer. If the layout needs installer changes, stop and
  report.

## Acceptance

- Office's `build:os` output is unchanged; its tests and lint pass.
- Games builds, tests and lints; the OS's full test run is green without
  `apps/add-ons/games`.
- The walk holds, with its numbers in the outcome.
- **Owner check** after the pushes (apps repo first, then the OS) and a
  deploy: Start on the VPS has no games until Games is installed, and then
  both play.

## Outcome (2026-11-06)

Built and committed: imbatranim-apps `647580f` (the Games group, with
Minesweeper and Solitaire, a `groups.test.ts` and a `sharedDir` option on
`osBuildConfig`) and OS `6a6a8d9` (the pin in `games.json`, `bomb` and `spade`
icons, `apps/add-ons/games` and its `manifest.ts` line and lockfile entries
deleted, README, tour and the Marketplace icon list). The desktop bundle is 18
KB smaller.

- **Layout decision: (a), one root workspace.** The measured table and the
  reasons are in
  [research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#the-layout-is-settled-a);
  the recipe for the next groups is
  [imbatranim-apps-group-recipe.md](../../wiki/imbatranim-apps-group-recipe.md).
- **Correction to the brief:** the games need the `shortcuts` capability,
  because the fenced App tests exercise the hotkeys.
- **Walk 2a passed (2026-11-06):** Games installed from a `file://` clone of
  imbatranim-apps at `647580f` in 8.5 s and 125 MB; the choices came back.
  The dev container had `MARKETPLACE_ALLOW_LOCAL_REPOS=false`, so the walker
  restarted the servers with it on. Sync only adds files, so `/app` may hold
  stale deleted add-ons; the next walk should sync with deletes or say so.
- Ticket: ready for deploy.

Left for the owner: push imbatranim-apps first, then this repo, then deploy.
Then check that Start on the VPS has no games until Games is installed, and
that both play afterwards.
