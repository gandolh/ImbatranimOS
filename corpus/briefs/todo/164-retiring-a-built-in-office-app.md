# Brief 164 — Retiring a built-in office app

## Context

Settled 2026-10-21 ([decisions-office-suite.md](../../wiki/decisions-office-suite.md)):
Docs, Sheets, Slides, PDF Viewer and norPDF leave `apps/add-ons` for
`imbatranim-office`, where PDF Viewer and norPDF become one app. A built-in is
removed only once its suite version does everything it did. Until then both
exist side by side: the built-in keeps its id and stays the default for its
types, because built-ins come first in `APP_REGISTRY` (brief 162, decision 8).

This brief is the OS half of that hand-over. It is run **once per app**, each
run its own commit, when the suite's brief for that app reports parity
(imbatranim-office briefs 02, 05 and 06; Slides and CAD are new there, so only
Slides has a built-in to retire). The order follows the suite: Docs first, then
Slides, Sheets, and the two PDF apps together.

## The table

| Built-in id | Package | Suite app id | Extensions | Hard-coded references found 2026-10-21 |
|---|---|---|---|---|
| `docs` | `apps/add-ons/docs` | `office-docs` | `docx` | `newFileTemplates.ts:59` in file-manager returns `'docs'` |
| `slides` | `apps/add-ons/slides` | `office-slides` | `pptx`, `ppt` | none found |
| `sheets` | `apps/add-ons/sheets` | `office-sheets` | `xlsx`, `xls`, `csv` | `newFileTemplates.ts:59` returns `'sheets'` |
| `pdf-viewer`, `norpdf` | `apps/add-ons/pdf-viewer`, `apps/add-ons/norpdf`, `packages/pdfcore-engine` | `office-pdf` | `pdf` | `PREFERRED_DEFAULT` in `associations.ts:183` maps `pdf` to `'norpdf'` |

The suite ids are the ones imbatranim-office's brief 01 fixes. If that brief
chose others, use those and correct this table in the commit.

## Steps, per app

1. **Check parity is real.** Read the suite brief's outcome. Its parity
   checklist must be ticked in Chrome against this OS, with the suite installed
   from the catalog (not a dev server). If anything is open, stop.
2. **Move the user's choices to the new id.** A one-time, idempotent migration
   in the desktop (it runs at sign-in, once per id pair, and records that it
   ran in a dotfile) rewrites the old id to the new one wherever a dotfile
   stores an app id: association overrides (`associations.ts`), the disabled
   set (`addonStore.ts`), desktop icons (`desktopStore.ts`), startup apps
   (`startupStore.ts`), and recents attribution. Grep `apps/core/src` for any
   other store that keeps an app id before writing it; the list above is what
   2026-10-21's code had. A choice for an app that is not installed stays as it
   is, and `resolveOpener` already skips an override whose app is missing.
3. **Remove the built-in.** Delete the package, its line in
   `apps/core/src/manifest.ts`, its workspace entry and the lockfile entries
   that only it used. For the PDF pair, also `packages/pdfcore-engine` (it moved
   to the suite with norPDF) and the `pdf` row of `PREFERRED_DEFAULT`.
4. **Fix the hard-coded references** in the table. `newFileTemplates.ts` stops
   naming an app: it resolves the opener for the new file's name through
   `resolveOpener`, and the file manager hides "New → Document" or "New →
   Spreadsheet" when nothing claims that extension.
5. **Make the empty case honest.** With the suite not installed, a `.docx` has
   no claimant and `resolveOpener` returns `reason: 'none'`. The chooser that
   follows names the gap: "No installed app opens .docx files. Office in
   Settings → Marketplace does." Nothing opens a binary office file in Notepad.
6. **Corpus.** `status.md` row, `log.md`, and the built-in app's lines in
   `decisions-pivot-era.md` ("Office suite + post-v1 apps") and
   `decisions.md` (2026-08-03, the PDF decision) get a dated note that the app
   now lives in imbatranim-office. `norpdf.md` moves to the suite's corpus with
   the PDF run, leaving a one-line pointer.

## Must preserve

- A user who had chosen a built-in for a type gets the suite app for that type
  after the migration, with no prompt.
- An OS without the suite installed still boots, opens every non-office file as
  before, and says plainly where office files can be opened.
- Every other add-on and its associations, and the image build
  (`npm ci` on the image's manifests must not reference a removed package).

## Acceptance, per run

- `npm run typecheck`, `npm run lint`, backend and core tests pass; tests that
  imported the removed package go with it or move to the suite.
- In Chrome on the dev container, with the suite installed: a file of the
  app's type opens in the suite app on double-click; an override set before the
  run still applies; the app's desktop icon and recents survive.
- With the suite uninstalled: the same file shows the chooser with the
  Marketplace sentence; "New → Document" (or Spreadsheet) is hidden.
- The production image builds and its size does not grow.

## Files you OWN

- `apps/add-ons/{docs,slides,sheets,pdf-viewer,norpdf}/**` (to delete, one per run)
- `packages/pdfcore-engine/**` (PDF run only)
- `apps/core/src/manifest.ts`, `apps/core/src/shared/registry/associations.ts`
- `apps/core/src/shared/store/*` (the migration only)
- `apps/add-ons/file-manager/src/lib/newFileTemplates.ts` and the New menu
- root `package.json` workspaces, `package-lock.json`

## Files you must NOT touch

- The marketplace backend and host (162 and 163 own them).
- Any add-on outside the table.
