# Brief 164 — Retiring a built-in office app: Docs, and the Office catalog entry

## Scope (2026-10-22)

This brief is now **the Docs run only**, plus the catalog entry every run
needs. It builds the migration (step 2) that the later runs reuse:
[165](165-retire-built-in-slides.md) (Slides),
[166](166-retire-built-in-sheets.md) (Sheets) and
[167](167-retire-pdf-viewer-and-norpdf.md) (PDF Viewer and norPDF), each
waiting on its imbatranim-office walk brief. The table and the steps below stay
as the reference for all four.

**Docs is ready.** imbatranim-office brief 02 walked its parity checklist in
the OS, and the one failing line ("three windows", which the built-in failed
too) is fixed in the suite (`1ca83c0`). While both apps are installed,
keystrokes typed in the built-in land in the suite's document (SuperDoc's
window-level input bridge; the suite's windows are marked, the built-in's are
not), so retiring the built-in also ends that.

**Step 0, the catalog entry.** Commit `marketplace/imbatranim-office.json`: the
office repo's `os/descriptor.template.json` with `source.ref` set to the full
40-hex office commit that was walked (its `main` at the time; check
`git log` there). Its five apps list beside the built-ins, which stay the
default for their types until their own runs. The owner pushes the office repo
before this one.


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

- `marketplace/imbatranim-office.json` (new: the Office catalog entry)
- `apps/add-ons/{docs,slides,sheets,pdf-viewer,norpdf}/**` (to delete, one per run)
- `packages/pdfcore-engine/**` (PDF run only)
- `apps/core/src/manifest.ts`, `apps/core/src/shared/registry/associations.ts`
- `apps/core/src/shared/store/*` (the migration only)
- `apps/add-ons/file-manager/src/lib/newFileTemplates.ts` and the New menu
- root `package.json` workspaces, `package-lock.json`

## Files you must NOT touch

- The marketplace backend and host (162 and 163 own them).
- Any add-on outside the table.

## Built 2026-10-28 (Docs run); the walk stopped part way, the owner paused the run

**Built in `c3baeef` (version 1.45.0).**

- Step 0: `marketplace/imbatranim-office.json` is the office repo's
  `os/descriptor.template.json` pinned to
  `1ca83c094f74acc22f32f5d5417dd63e9fbc7dec` (`1ca83c0`, the commit this brief
  names as fixing brief 02's last line). The template is byte-identical at
  every later office commit, so the later runs move only `source.ref`. The
  owner pushes the office repo before this one.
- Step 2: `apps/core/src/shared/store/retiredApps.ts` holds the id pairs
  (`docs` → `office-docs` so far) and `migrateRetiredAppIds()`, called from
  `rehydrateDotfileStores()` once the server's dotfiles are in the stores. It
  rewrites the association overrides, the disabled set, the desktop icons (a
  place the owner gave the suite's icon wins) and the startup apps, and
  records each pair in a new dotfile, `imbatranimos:app-id-migrations`
  (added to `DOTFILE_KEYS` in `prefs.ts`). Recents live on the server, where
  re-recording a row moves it to the top, so `lib/recentFiles.ts` reads them
  through the same table instead of rewriting them.
- Step 3: the package, its manifest line and the lockfile entries only it
  used are gone (SuperDoc, Vue, ProseMirror, Yjs and their deps; jsdom and a
  few others became dev-only).
- Step 4: `newFileTemplates.ts` names no app. `newFileOpener` resolves the
  new file's name through the associations (an override or a claimant; never
  the text fallback), and the background menu leaves New Document or New
  Spreadsheet out while nothing installed opens it.
- Step 5: the Open With chooser, with no claimant for an extension the
  suite took over, says "No installed app opens .docx files. Office in
  Settings → Marketplace does." (`marketplaceOpeners.ts`, one line per type).
- The README, the docs site's tour and stack pages drop the built-in.

**Checked:** typecheck, lint and core tests (564 at the time) pass, and the
file manager's tests (83, with a new `newFileTemplates.test.ts`). The
production image built at `608ad1e` (which has this commit) is 279,598,118
bytes against 315,050,234 at `0937bba`: it shrank.

**Walked in Chrome against the dev container, Office `21c5c1d` installed from
a local `file://` repository**, with the old choices seeded through the API
first (`.docx` → `docs`, a pinned desktop icon for `docs`, `docs` as a startup
app, a recent `letter.docx` attributed to `docs`, the migration record
emptied):

- After sign-in the dotfiles read `.docx` → `office-docs`, startup
  `office-docs`, the pinned icon under `office-docs` at the same place (the
  suite's Docs icon showed there), and the record `docs>office-docs`.
- `letter.docx` double-clicked in Files opened in the suite's Docs; its menu
  said "Open in Docs".
- The Start menu listed `letter.docx` in recents, and clicking it opened the
  suite's Docs.

**Where it stopped:** the background menu's New Document (the scripted
right-click on an empty part of the list opened no menu, not yet looked
into), and the whole "suite uninstalled" half (the chooser's Marketplace
sentence, New Document hidden). Step 6's dated notes in
`decisions-pivot-era.md` and `decisions.md` are not written yet.

**Found:** startup apps from the Marketplace never open at sign-in.
`runStartupApps()` keeps only ids already in `APP_REGISTRY`, and the
Marketplace catalog registers its apps after that runs. The migrated
`office-docs` startup entry is kept but does nothing until that changes; it
was true for any Marketplace app before this brief. **Owner:** the license
decision (`decisions-pivot-era.md`, "required by SuperDoc") and the README's
reason for AGPL both rested on Docs; the README no longer gives that reason,
the license is unchanged.

## Outcome (2026-10-28): the walk finished, the Docs run closes

**Walked in Chrome against the dev container on 2026-10-28, Office
`909c321` installed from a local `file://` repository** (the walk's own
catalog entry; the repo's stays pinned to `1ca83c0` until brief 165 moves
it). No code changed since `c3baeef`.

- **New Document, the suite installed:** the background menu listed New
  Spreadsheet and New Document. New Document wrote `Untitled
  Document.docx` beside `letter.docx` and opened it in the suite's Docs,
  which showed the blank page (3.8 s, load average 29).
- **The suite uninstalled:** double-clicking `letter.docx` showed the Open
  With chooser with "No installed app opens .docx files. Office in Settings →
  Marketplace does.", no app picked, and nothing opened. The background menu
  had no New Document (New Spreadsheet stays while the built-in Sheets does).
  No Docs icon showed; the dotfiles kept `.docx` → `office-docs`, the startup
  entry and the pinned icon's place.
- **Reinstalled:** `letter.docx` opened straight in the suite's Docs with no
  prompt, and the Docs icon came back where it was pinned.

**Why the scripted right-click opened no menu last time:** the element that
owns the background menu is only as tall as the listing, so in a short folder
a right-click below the last row reaches nothing. In this walk the menu came
from the header row. Not this brief's files:
[files-background-menu-misses-empty-space](../../todos/files-background-menu-misses-empty-space.md).

**Step 6:** `decisions-pivot-era.md`'s office section has a dated note that
Docs left for imbatranim-office. `decisions.md`'s 2026-08-03 entry is the PDF
decision and gets its note in brief 167.

**The owner's answers of 2026-10-28:** the AGPL licence stays by the owner's
choice, noted beside its old SuperDoc reason; Marketplace startup apps that
never open at sign-in are [brief 183](183-marketplace-startup-apps-open-at-sign-in.md).
