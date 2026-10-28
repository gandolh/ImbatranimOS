# Brief 166 — Retire the built-in Sheets

## Context

The Sheets run of [brief 164](../done/164-retiring-a-built-in-office-app.md)'s
hand-over: remove the built-in once its imbatranim-office version has passed
its walk in the OS (imbatranim-office brief 08). Brief 164's Docs run builds the migration
that moves the owner's choices to the new id; this run adds its id pair to it.

| Built-in id | Package | Suite app id | Extensions |
|---|---|---|---|
| `sheets` | `apps/add-ons/sheets` | `office-sheets` | `xlsx`, `xls`, `csv` |

Hard-coded: `newFileTemplates.ts` in the file manager returns `'sheets'`; brief
164 makes it resolve the opener for the new file's name instead, so check New →
Spreadsheet opens the suite app.

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

**Built in `b81a87a` (version 1.58.0). Office stays pinned to `909c321`**
(set by brief 165), which has every walk fix and brief 13's formula worker;
its Sheets still computes formulas past row 1000 as `#NAME?`, and
[office-pin-after-the-row-1000-fix](../../todos/office-pin-after-the-row-1000-fix.md)
moves the pin once the office repo's fix lands.

- Step 1: imbatranim-office brief 08 walked seven lines in this OS and failed
  the 10 MB formula line (the built-in failed it too); the owner cleared it
  on 2026-10-28, and brief 13 moved the formula engine into a worker.
- Step 2: `sheets` → `office-sheets` joins `RETIRED_APP_IDS`.
- Step 3: the package, its manifest line, Univer and ExcelJS (263 packages)
  are gone, and so are the root `overrides` entries that only patched
  `@univerjs/core` and `exceljs`. Four core tests that use `fs`, `path` or
  `url` had been getting Node's types by way of the Sheets package's
  dependencies (core's `tsconfig.app.json` lists only `vite/client`); each now
  says `/// <reference types="node" />`.
- Step 4: `newFileTemplates.ts` already names no app (brief 164); New
  Spreadsheet resolves to `office-sheets` with the suite installed and is
  gone without it. The tests that named `sheets` follow the new id; the
  README and the docs site drop the built-in, and the stack page's licence
  paragraph says SuperDoc has left and the licence stays by the owner's
  choice.
- Step 5, three types, three answers. **`.xlsx`** gets brief 164's
  Marketplace sentence. **`.xls`** does not: Office's Sheets refuses Excel
  97-2003 by name (office `e57a4ea`), so the chooser says "No app here opens
  .xls files (Excel 97-2003). Office's Sheets opens .xlsx.", as brief 165
  did for `.ppt`. **`.csv`** is text, so with nothing installed that claims
  it, it now opens in the Code Editor, as a `.tsv` always has
  (`TEXTISH_EXTENSIONS`); Office's Sheets claims it once installed. That
  departs from step 5's literal "shows the chooser": a chooser for a text
  file the OS can open would be a dead end the text fallback exists to
  avoid. The Marketplace sentence covers `.csv` only when the Code Editor is
  disabled too.
- Step 6: the pin stays at `909c321`.

**Office's descriptor still lists `xls` in Sheets' `opens`**, though the app
refuses it, so with Office installed a `.xls` opens Office's Sheets, which
says it can't read it. That is the office repo's to change.

**Checked:** `npm run typecheck` and `npm run lint` pass; core 565 tests,
the file manager's 85 and the backend's 805 unit tests pass. The backend's
e2e suite was not run; this brief changed no backend code.

**The production image shrank** from 278,157,380 bytes at `dbd0c04` (brief
165) to 262,170,013 at `b81a87a`, both built from `git archive` with the
prebuilt `better-sqlite3`; the desktop's static files went from 30.7 MB to
19.5 MB.

**Walked in Chrome against the dev container**, Office `909c321` installed
from a local `file://` repository, with the old choices seeded while the
built-in still ran (`.xlsx` → `sheets`, the Sheets icon pinned at 1232,400,
`sheets` in the startup list, a recent `book.xlsx` attributed to `sheets`):

- After sign-in: `.xlsx` → `office-sheets`, startup `office-sheets`, the
  record `…, sheets>office-sheets`, Office's Sheets icon at 1232,400, pinned.
- `book.xlsx` (the suite's `styles.xlsx` fixture) and `data.csv` both said
  "Open in Sheets" and opened in Office's Sheets; Start's recent
  `book.xlsx`, attributed to `sheets`, opened Office's Sheets too.
- New Spreadsheet wrote `Untitled Spreadsheet.xlsx` and opened it in
  Office's Sheets with an empty grid.
- Office uninstalled: `book.xlsx` showed the Marketplace sentence, `old.xls`
  the `.xls` sentence, `data.csv` opened in the Code Editor, and the
  background menu had neither New Spreadsheet nor New Document. Reinstalled:
  `book.xlsx` opened straight in Office's Sheets.

The first uninstalled walk showed the generic sentence for `.xlsx`: the dev
container's Vite had not noticed the synced file and served the brief-165
module. After a container restart it served the new one; the results above
are from that run.
