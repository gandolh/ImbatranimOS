> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [games-install-from-imbatranim-apps](../../todos/games-install-from-imbatranim-apps.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 51 — Games install from imbatranim-apps

## Context

On 2026-11-06 the owner asked for the apps we made to become opt-in installs
from imbatranim-apps, so a fresh OS starts cleaner.
[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md) lists
every app and proposes waves. This brief is the pilot. It moves the two
cheapest apps, Minesweeper and Solitaire, as the Games group, and it settles
how a group lives in the apps repo.

Games is the cheapest app to move:
- 1,131 source lines and 319 test lines in `apps/add-ons/games`, one package
  with two manifests (`minesweeperManifest`, `solitaireManifest` in
  `src/index.ts`);
- no backend module and no `system` capability;
- from the kit they use only `Button`, `ScrollArea`, `Select`, `cn` and
  `useRegisteredHotkeys`, all exported by `packages/ui/src/index.ts`;
- best times are kept by a zustand `persist` store under the key
  `imbatranimos:games` (`src/lib/statsStore.ts`).

Together they are 16 kB of the desktop build, so the image barely changes.
The point is to prove the path.

**The layout is the open part**
([research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#2-install-groups-and-start-folders)).
The office build is anchored at the repo root. `osBuildConfig` in
`packages/shared/src/build/osBuild.ts` finds apps under `<root>/apps`, the kit
under `<root>/vendor/imbatranim-ui` (a `vendorDir` option exists), and its
helpers under `<root>/packages/shared/src`, which is hard-coded. A group in
its own folder with its own lockfile would import those helpers from outside
its `node_modules`, so `vite` wouldn't resolve.

## Depends on

Brief 50 (the repo is imbatranim-apps).

## Owner decisions

Approved by the owner on 2026-11-06 ("looks good, write the briefs"): the
research's defaults, groups included. The calls, with the default this brief
builds:

1. **The install unit:** groups, one descriptor each (default); one
   descriptor per app; or one suite for everything. If the owner picks
   anything but groups, steps 1 and 3 change and this brief needs a rewrite
   first.
2. **The descriptor:** id `games`, name "Games", a `schemaVersion: 2` static
   suite on the shared kit. Default: yes.
3. **The layout, measured on Games before choosing:**
   - (a) one root workspace, where the group descriptor runs a scoped
     `npm ci --workspace=<group>` and builds that workspace;
   - (b) a self-contained group folder with its own lockfile and the build
     helper as a `file:` package, or its own copy of it.

   Default: (a) if the scoped install really leaves Office's dependencies
   out, otherwise (b). Either way, Office must keep building from the same
   commit.
4. **The ids stay `minesweeper` and `solitaire`.** The owner's pins,
   startup entries and best times come back when Games is installed, and no
   `RETIRED_APP_IDS` pair is needed. Default: yes.
5. **The icons stay Bomb and Spade.** They join the catalog's `ICONS` as
   `bomb` and `spade`, instead of falling back to `gamepad-2`. Default: yes.

## What to do

1. **The layout spike** (apps repo, scratch clone). Lay out Games both ways
   from decision 3. For each, measure:
   - the install's `node_modules` size, time, and whether Office's
     dependencies came along;
   - the build time and output size.

   Pick per decision 3 and write the numbers into the outcome.
2. **Port** (apps repo). Make Minesweeper and Solitaire kit apps that export
   `App`:
   - take the engines, components, stats store and tests across unchanged;
   - keep the store key `imbatranimos:games`;
   - add `zustand` as the group's own dependency, pinned to the version the
     OS resolves, because it is not part of the shared kit;
   - parameterise the build helper where it hard-codes the root, so Office's
     output is unchanged;
   - make the group's `build:os`, tests and lint pass;
   - add Games to the README and the corpus as the second group.
3. **The catalog entry** (this repo). Add `marketplace/games.json`:
   - two apps with the manifests' names, descriptions and meta;
   - windows 340×440 (min 300×400) and 560×560 (min 460×460);
   - `multiInstance: false`, no capabilities;
   - pinned to the apps repo's commit, `minSystemVersion` 2.

   Add `bomb` and `spade` to `ICONS` in
   `apps/core/src/shared/registry/marketplace.tsx`.
4. **Remove the built-in** (this repo). Delete `apps/add-ons/games` and its
   lines in `apps/core/src/manifest.ts`, the lockfile entries and any test
   that names the two apps.
5. **The walk** (dev container, the apps repo copied in as a `file://`
   repository with `MARKETPLACE_ALLOW_LOCAL_REPOS=true`, as the Office walks
   did).
   - **Before:** pin Minesweeper, put it on the startup list, and finish a game
     so a best time exists.
   - **After the built-in is gone:** Start has no games; the pin, the startup
     entry and the best time stay in place.
   - **Install Games from Settings → Marketplace.** Record the install time,
     the size it leaves under `~/.imbatranim/apps/`, and the served output.
     Both games open and play; the pin, startup entry and best time came back.
   - **Uninstall:** both games are gone again.
6. **Image bytes.** Record the production image size before and after
   (`docker image inspect --format '{{.Size}}'`).
7. **Corpus.** Record the layout call in
   [decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md)
   and the apps repo's decisions page. Also update:
   - the research pages: wave 1 done for Games, and the measured layout;
   - status.md and log.md in both repos.

   Don't add a glossary term for "group" until the owner settles the word.

## Files you OWN

- in the apps repo: the new Games group, the build helper's root handling,
  its README and corpus
- in this repo: `marketplace/games.json`, `ICONS` in
  `apps/core/src/shared/registry/marketplace.tsx`, `apps/add-ons/games/`
  (deleted), the two lines in `apps/core/src/manifest.ts`,
  `package-lock.json`, the corpus pages in step 7

## Files you must NOT touch

- The Office apps' code and its descriptor, beyond what the build helper's
  root handling needs. Office's output must stay the same.
- The marketplace installer (`apps/backend/src/modules/marketplace/`). If
  the layout needs installer changes, stop and report: that becomes its own
  brief.
- Any other add-on.

## Acceptance

- Office's `build:os` output is unchanged (same files), and its tests and
  lint pass.
- The Games group builds, tests and lints. The OS's full test run is green
  without `apps/add-ons/games`.
- The walk in step 5 holds, with its numbers in the outcome.
- **Owner check** after the owner pushes the apps repo, then the OS, then
  deploys: Start on the VPS has no games until Games is installed from
  Settings → Marketplace, and then both play.
