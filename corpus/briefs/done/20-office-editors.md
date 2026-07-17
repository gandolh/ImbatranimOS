# Task 20 — Office suite, part 2: Sheets + Docs editors

> **Outcome (2026-07-17, done):** Landed as relicense `b9fe0fa` +
> editors `3531b41` + review fixes `b46f64e`. TWO deviations from the
> locked spec, both explicit revisits: (1) the SheetJS CE spike FAILED —
> its writer strips fonts/fills/borders (Pro-only), so the xlsx bridge
> is **ExcelJS** (user-approved same day; full bar passed incl. styles,
> verified via independent openpyxl read). (2) SuperDoc 1.45 export
> silently returns ORIGINAL bytes when a docx lacks styles.xml /
> document.xml.rels / custom.xml (unguarded reads; throw swallowed) —
> fixed with `normalizeDocx()` injecting the missing parts on open;
> docx round-trip then verified on disk. Core gained generic
> `updateTitle` + close-guard hooks in windowStore (controller-
> authorized scope extension; the brief's "manifest.ts only" core
> assumption was wrong). Review pass fixed a shared-formula corruption
> and a dirty-flag save race in both editors. AGPL-3.0-only relicense
> landed repo-wide. Reuse debt captured
> (todos/office-addon-shared-helpers.md).

## Context

Second half of the office suite (todos/office-suite-addon.md, grilled
2026-07-17). Two real editors, client-side only. Locked decisions:

- **Sheets** = Univer (Apache-2.0) grid + a **SheetJS CE ↔ Univer
  bridge** for xlsx open/save (Univer's official xlsx exchange is
  paid/server-side; the bridge maps values, formulas, basic styles).
- **Docs** = **SuperDoc** (real docx round-trip in the browser). It is
  **AGPL-3.0** — this brief relicenses the repo AGPL-3.0 (user approved
  2026-07-17: source stays public on GitHub, no plans to sell).
- **Explicit Save only**: Ctrl+S + toolbar button, overwrite in place,
  dirty marker (`•` in window title). No autosave (unlike notepad —
  whole-file binary serialization per keystroke is too heavy and
  amplifies round-trip bugs), no Save As (deferred).
- **New documents** are born in the file-manager: right-click → New →
  Spreadsheet / Document creates a blank .xlsx/.docx in place (inline
  naming, like New Folder), then opens it — editors stay dialog-free.

Runs after brief 19 (shares the ext→app map). Post-v1, non-gating.

## Files you OWN

- `apps/add-ons/sheets/` — new package `@imbatranim/sheets`, app
  "Sheets" (Univer + SheetJS bridge)
- `apps/add-ons/docs/` — new package `@imbatranim/docs`, app "Docs"
  (SuperDoc)
- `apps/core/src/manifest.ts` — two new registry lines
- `apps/add-ons/file-manager/` — ext map entries (xlsx/xls → sheets,
  docx → docs) + context-menu New → Spreadsheet / Document
- `LICENSE` (new, AGPL-3.0-only) + `"license"` fields in package.json
  files + a README licensing note

## What to do

1. **Spike (gate)**: SheetJS→Univer→SheetJS round-trip on 2–3 real
   xlsx files in a throwaway harness. Bar: values, formulas, and basic
   formatting survive open→edit→save. If the bridge can't hit the bar,
   stop and re-decide the sheets engine (log.md entry) before building.
2. Relicense: add LICENSE (AGPL-3.0-only), stamp package.json
   `license` fields, README note. One commit, before SuperDoc lands.
3. Scaffold both packages (notepad pattern; core public surface only).
4. Open path: notepad-style `{ openPath }` payload, bytes via
   `GET /api/files/download` (blob).
5. Save path: serialize (SheetJS write / SuperDoc export) and
   `POST /api/files/upload` (multipart; service overwrites in place).
   Surface a clear error when the file exceeds FILES_MAX_UPLOAD_BYTES.
   Ctrl+S + toolbar Save; dirty `•` in the window title; warn on
   close-with-unsaved-changes.
6. File-manager New → Spreadsheet / Document: writes a minimal blank
   template (SheetJS empty workbook / SuperDoc blank docx) at the
   current directory, then `openApp` into the right editor.
7. **Lazy-load both engines** as dynamic-import chunks (Univer and
   SuperDoc are the heaviest deps in the repo — core bundle and boot
   time must not regress).

## Acceptance

Round-trip proof: open a real xlsx in Sheets, edit cells + a formula,
Ctrl+S, re-open — edits persisted, formatting bar met; same for a real
docx in Docs (formatting survives per SuperDoc round-trip). New →
Spreadsheet/Document creates and opens blank files. Dirty marker and
close-warning work. LICENSE landed. Engines are lazy chunks; desktop
boot unaffected. Root `turbo` build/typecheck/format:check green
(backend lint debt exempt).
