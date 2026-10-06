# Task 156 — The office editors ask before overwriting a file changed on disk

## Context

Promoted from [todos/office-editors-save-conflict.md](../../todos/office-editors-save-conflict.md).
Brief 155 gave Notepad, Code Editor and Markdown Editor a save precondition: a
save sends the version it read, and a 409 opens `FileConflictDialog`
(Overwrite / Reload from disk / Cancel). The owner confirmed on 2026-10-04 that
the office editors get the same check later
([decisions-estate-era.md](../../wiki/decisions-estate-era.md)).

## Files you OWN

- `packages/ui/src/lib/saveOverRead.ts` (new) and its test, `packages/ui/src/index.ts`
- `apps/add-ons/sheets/src/Sheets.tsx`
- `apps/add-ons/docs/src/Docs.tsx`

## What to do

1. A kit helper, `saveOverRead`, runs the 155 sequence once for every editor
   that saves over the file it read: upload with `expected`, and on a
   `FileConflictError` ask through `useFileConflict`. Overwrite uploads again
   unconditionally; Reload and Cancel write nothing and are returned.
2. Sheets and Docs read with `readWithVersion`, keep the version, save through
   the helper, and keep the new version after a write. Reload runs the load
   again on the same file. Neither Univer nor SuperDoc can undo a reload, so
   Reload discards the unsaved edits, which is what the dialog's wording says.
3. Slides is a viewer: it never writes the deck, and its PNG export is a Save
   As, which is a deliberate overwrite. It needs no check.

## Acceptance

- The helper's unit tests cover every outcome.
- In the dev container, each of Sheets and Docs: an edit, then a change on
  disk, then Save opens the dialog with nothing written. Cancel keeps the edits
  and the disk file. Reload shows the disk copy, clean. Overwrite writes. A
  later save with no change on disk writes without asking.

## Outcome (2026-10-06)

Done as written. `saveOverRead` (6 unit tests) is exported from
`@imbatranim/ui`. Sheets and Docs keep `diskVersionRef` and a `reloadKey` that
re-runs their load effect. Typecheck, lint, Prettier and both apps' suites (53
and 36 tests) pass.

Walked in Chromium in the dev container, with a CSV in Sheets and a `.docx` in
Docs. Every acceptance step held in both: dialog with nothing written, Cancel
(disk untouched, still dirty), Reload (disk copy shown, clean), Overwrite
(written), then a plain save with no false conflict.

The walk found an older Sheets bug, fixed in the same commit:
`engine/univer.ts` notified edits only once per load. After the first save
cleared dirty, later edits never set it again, so Save stayed disabled and
closing the window would have dropped those edits without asking. It now
notifies on every user edit (`setDirty(true)` on an already dirty sheet costs
nothing). Docs already notified on every edit.

The dev container wasn't running `compose watch`, so the changed files were
copied in with `docker cp` for the walk. Before that copy, the old code
overwrote a changed file without asking, which is the bug this brief closes.
