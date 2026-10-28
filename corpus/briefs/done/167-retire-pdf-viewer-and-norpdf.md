# Brief 167 — Retire PDF Viewer and norPDF

## Context

The PDF run of [brief 164](../done/164-retiring-a-built-in-office-app.md)'s
hand-over: remove the built-in once its imbatranim-office version has passed
its walk in the OS (imbatranim-office brief 09). Brief 164's Docs run builds the migration
that moves the owner's choices to the new id; this run adds its id pair to it.

| Built-in id | Package | Suite app id | Extensions |
|---|---|---|---|
| `pdf-viewer`, `norpdf` | `apps/add-ons/pdf-viewer`, `apps/add-ons/norpdf`, `packages/pdfcore-engine` | `office-pdf` | `pdf` |

Both built-ins go in one run; `packages/pdfcore-engine` goes with them (it
moved to the suite). Hard-coded and other references found on 2026-10-21:
`PREFERRED_DEFAULT` in `associations.ts` maps `pdf` to `'norpdf'` (drop the
row), and its test; `file-manager/src/lib/openWith.test.ts`;
`markdown-editor/src/lib/linkTarget.test.ts`; comments in the backend's
`files.service.ts`, `packages/ui/src/lib/mapGetOrInsert.ts`,
`infrastructure/Dockerfile` and `docker-compose.yml`; the docs site
(`apps/docs/sidebars.ts`, `docs/tour.mdx`); `corpus/wiki/norpdf.md` (it moves to
the suite's corpus as `pdf.md`; leave a one-line pointer);
`.claude/skills/codegraph/SKILL.md`; and the lockfile's `@pdfcore/engine` and
its `@napi-rs/canvas`.

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

**Built in `51608b5` (version 1.59.0). Office stays pinned to `909c321`**
(set by brief 165); [office-pin-after-the-row-1000-fix](../../todos/office-pin-after-the-row-1000-fix.md)
moves it once the office repo's Sheets fix lands.

- Step 1: imbatranim-office brief 09 walked nine lines in this OS and failed
  the first-page timing by 40 ms; the owner cleared it on 2026-10-28, and
  brief 182 brought the suite's PDF under PDF Viewer's time.
- Step 2: `norpdf` → `office-pdf` and `pdf-viewer` → `office-pdf` join
  `RETIRED_APP_IDS`, norPDF first, so its icon's place wins when both were
  pinned. Two built-ins on one suite app needed one change: Office's PDF is
  disabled only when **both** were disabled, since hiding PDF Viewer, the
  light option, said nothing about wanting no PDF app. Unit tests cover both.
- Step 3: both packages and `packages/pdfcore-engine` are gone, with pdf.js,
  `@napi-rs/canvas` and the root `pdfjs-dist` override. `PREFERRED_DEFAULT`
  lost its only row and stays, empty, as the mechanism.
- Step 4: every reference the brief listed is fixed. Its Files you OWN
  did not list the file manager's and Markdown Editor's tests or the
  comments it named; they changed too, as its own list asked. The test that
  showed a contested type going to the other claimant now uses a Marketplace
  app beside Markdown Editor, since no two built-ins share a type any more.
  `mapGetOrInsert.ts` stays in the kit (`sharedKit.ts` hands it to kit apps);
  only its comment changed. The README, the docs site's tour, stack page and
  sidebar, and the codegraph skill drop the two apps.
- Step 5: with Office not installed a `.pdf` gets the Marketplace sentence.
- Step 7: `decisions.md`'s 2026-08-03 PDF decision and
  `decisions-pivot-era.md`'s office section carry dated notes.
  **`norpdf.md` is a pointer now.** The brief said it moves to the suite's
  corpus as `pdf.md`; this run may not write in imbatranim-office, and that
  corpus already has a `wiki/pdf.md`. The old page is in git before
  `51608b5`; merging anything from it into the suite's page is an owner step.

**Checked:** `npm run typecheck` and `npm run lint` pass; core 567 tests,
the file manager's 85, Markdown Editor's 113 and the backend's 805 unit
tests pass. The backend e2e suite and the docs site's build were not run.

**The production image shrank, measured with one subtraction.** It built
at `51608b5` (two earlier attempts failed when node-gyp could not reach
nodejs.org for node-pty's headers) at 272,350,114 bytes, but
`better-sqlite3` compiled from source in that build again
([native-build-leftovers-in-the-image](../../todos/native-build-leftovers-in-the-image.md)).
Its `build/` holds 15,252,971 bytes against 2,366,984 at `b81a87a`, and the
rest of `node_modules` is byte for byte the same size, so without the
leftovers the image is 259,464,127 bytes against 262,170,013 at `b81a87a`:
2.7 MB smaller. The desktop's static files went from 19,395,208 to
16,689,352 bytes.

**Walked in Chrome against the dev container**, Office `909c321` installed
from a local `file://` repository, with the old choices seeded while both
built-ins still ran: `.pdf` → `pdf-viewer`, norPDF's icon pinned at
1232,304 and PDF Viewer's at 1232,208, `norpdf` disabled, `norpdf` in the
startup list, a recent `NIST.SP.800-218.pdf` attributed to `norpdf` and
then to `pdf-viewer`.

- After sign-in: `.pdf` → `office-pdf`; startup `office-pdf`; the record
  `…, norpdf>office-pdf, pdf-viewer>office-pdf`; the disabled set still
  `norpdf` only, so Office's PDF stayed enabled; Office's PDF icon at
  norPDF's place, 1232,304, pinned.
- The NIST file said "Open in PDF" and Office's PDF drew its first page;
  Start's recent, attributed to `pdf-viewer`, opened Office's PDF.
- Office uninstalled: the NIST file showed "No installed app opens .pdf
  files. Office in Settings → Marketplace does.", the chooser listed no PDF
  app, and nothing opened. Reinstalled: it opened straight in Office's PDF.

The machine restarted part way through this walk; the uninstalled half and
the reinstall ran after it, in the same container and volume.
