# Brief 165 — Retire the built-in Slides

## Context

The Slides run of [brief 164](../done/164-retiring-a-built-in-office-app.md)'s
hand-over: remove the built-in once its imbatranim-office version has passed
its walk in the OS (imbatranim-office brief 07). Brief 164's Docs run builds the migration
that moves the owner's choices to the new id; this run adds its id pair to it.

| Built-in id | Package | Suite app id | Extensions |
|---|---|---|---|
| `slides` | `apps/add-ons/slides` | `office-slides` | `pptx`, `ppt` |

The suite opens `.pptx` and refuses `.ppt` by name, so after this run a `.ppt`
has no claimant. No hard-coded references were found on 2026-10-21.

## Steps

1. Read the walk brief's outcome. Every line passed in Chrome against this OS
   with the suite installed from the catalog; otherwise stop.
2. Add the id pair to brief 164's migration (associations, the disabled set,
   desktop icons, startup apps, recents attribution); it runs once per pair and
   records that it ran.
3. Remove the package, its line in `apps/core/src/manifest.ts`, its workspace
   entry and the lockfile entries only it used.
4. Fix the hard-coded references named above, then grep for the old id again.
5. With the suite uninstalled, a file of these types shows the chooser with
   the Marketplace sentence brief 164 added.
6. Move the office catalog entry's pin if the walk changed the suite
   (`marketplace/imbatranim-office.json`).
7. Corpus: `status.md`, `log.md`, and the dated notes brief 164 step 6 lists.

## Acceptance

- `npm run typecheck`, `npm run lint`, backend and core tests pass.
- In Chrome on the dev container, with the suite installed: a file of these
  types opens in the suite app on double-click; an override set before the run
  still applies; desktop icons and recents survive.
- With the suite uninstalled: the chooser names the Marketplace.
- The production image builds and does not grow.

## Files you OWN

- the package(s) in the table (to delete)
- `apps/core/src/manifest.ts`, `apps/core/src/shared/registry/associations.ts`
- the migration in `apps/core/src/shared/store/*`
- root `package.json` workspaces, `package-lock.json`
- `marketplace/imbatranim-office.json` (the pin only)

## Outcome (2026-10-28)

**Built in `dbd0c04` (version 1.57.0). Office pinned to `909c321`**
(`909c321dfb73815a4bcb50046f8bd920afa70c5d`), which has every walk fix and
brief 13's formula worker; the descriptor template is unchanged from
`1ca83c0` apart from the ref.

- Step 1: imbatranim-office brief 07 passed every line in Chrome against
  this OS with the suite installed from the catalog (its outcome of
  2026-10-27).
- Step 2: `slides` → `office-slides` joins `RETIRED_APP_IDS`. A desktop that
  moved Docs at brief 164's sign-in runs only the new pair; a new test covers
  that.
- Step 3: the package, its manifest line, `pptx-preview` and its `echarts`
  and `zrender` tree are gone (46 packages), and so is the root `overrides`
  entry that only patched `pptx-preview`'s dependencies.
- Step 4: no hard-coded id outside tests; `associations.test.ts` and the file
  manager's `openWith.test.ts` follow the new id, and the README and the docs
  site's tour and stack pages drop the built-in.
- Step 5: with Office not installed, a `.pptx` gets brief 164's sentence.
  **A `.ppt` does not:** Office's Slides refuses PowerPoint 97-2003 by name,
  so "Office … does" would be false. Its chooser now says "No app here opens
  .ppt files (PowerPoint 97-2003). Office's Slides opens .pptx." instead of
  the generic "the text editor opens most things". With the suite installed
  a `.ppt` has no claimant either and shows the same sentence.
- Step 6: the pin moved from `1ca83c0` to `909c321`. Sheets at that commit
  computes formulas past row 1000 as `#NAME?` (an office todo the office repo
  is fixing now); [office-pin-after-the-row-1000-fix](../../todos/office-pin-after-the-row-1000-fix.md)
  moves the pin once that lands.

**Checked:** `npm run typecheck` and `npm run lint` pass; core 567 tests,
the file manager's 84 and the backend's 805 unit tests pass. The backend's
e2e suite was not run for this brief; it has no Slides code.

**The production image shrank:** 278,157,380 bytes at `dbd0c04` against
279,598,118 at its parent `6028454`, both built from `git archive`; the
desktop's static files went from 32.1 MB to 30.7 MB. The first build at
`dbd0c04` came out 11.4 MB larger, and none of that was this brief:
`better-sqlite3`'s prebuilt binary did not download during that `npm ci`
(the machine's load average was near 40), so it compiled from source, and
the Dockerfile's strip step leaves a source build's `obj/`, `sqlite3.a` and
test extension behind. The same lockfile installed the prebuilt binary in a
plain `npm ci` and in the rebuild measured above.
[native-build-leftovers-in-the-image](../../todos/native-build-leftovers-in-the-image.md).

**Walked in Chrome against the dev container**, Office `909c321` installed
from a local `file://` repository, with the old choices seeded through the API
while the built-in still ran (`.pptx` → `slides`, the Slides icon pinned at
1232,496, `slides` in the startup list, a recent `deck.pptx` attributed to
`slides`; the migration record holding only `docs>office-docs`):

- After sign-in the dotfiles read `.pptx` → `office-slides`, startup
  `office-docs, office-slides`, the record `docs>office-docs,
  slides>office-slides`, and Office's Slides icon sat at 1232,496, pinned.
- `deck.pptx` (the suite's `theme.pptx` fixture, five slides) double-clicked
  in Files: the menu said "Open in Slides" and the suite's Slides drew it.
- Start's recent `deck.pptx`, attributed to `slides`, opened the suite's
  Slides.
- Office uninstalled: `deck.pptx` showed the Marketplace sentence, `old.ppt`
  the `.ppt` sentence, nothing opened, and Slides was no longer in the list.
  Reinstalled: `deck.pptx` opened straight in the suite's Slides.
