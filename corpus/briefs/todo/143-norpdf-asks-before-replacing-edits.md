# Brief 143 — norPDF asks before replacing an edited document

Status: **todo** · From the 2026-09-26 improvements sweep. EASY–MEDIUM ·
ADD-ON (`apps/add-ons/norpdf`). Independent. Implement inline.

## Context

norPDF loads a new document into the same window through three paths, and
none of them checks for unsaved work:

- the TopBar "Open PDF" button (`shell/TopBar.tsx:222`, always enabled — unlike
  Save at `:241`, `disabled={!doc || busy || !dirty}`), which runs the OS
  picker; its result latches into the `useOpenIntent` store
  (`NorPdf.tsx:126-131`);
- the open-intent effect itself (`NorPdf.tsx:88-119`), also reached when Files
  opens a PDF into this window;
- drag-and-drop (`NorPdf.tsx:157-168` → `takeFile` → `ctrl.openFile`).

All three end in `adopt()` (`src/app/useReaderController.ts:101-111`), which
disposes the previous `PdfDoc` and calls `setDirty(false)`.

**Failure:** annotate a PDF or fill a form field, then click Open PDF and pick
another file, or drop one onto the window. The new document replaces the old
and every unsaved annotation is gone, with no prompt. The close guard
(`useUnsavedGuard`, `NorPdf.tsx:72`) protects closing the window, not
replacing its document. Paint puts the same action behind a discard
confirmation (`Paint.tsx:454-470` `open()`, `:472-485` `fresh()`), and so does
Image Viewer for previous/next.

## Files you OWN

- `apps/add-ons/norpdf/src/NorPdf.tsx`, `src/app/useReaderController.ts`,
  `src/shell/TopBar.tsx`
- New tests. norPDF has no test runner: add a `vitest.config.ts` and
  `"test": "vitest run"`, mirroring another add-on.

## Files you must NOT touch

- `packages/pdfcore-engine` (the vendored engine) and the `packages/ui` kit
  components — reuse them as they are.

## What to do

1. Put one gate in front of every replace path, e.g.
   `requestReplace(load: () => Promise<void>)`. When `dirty`, show the kit's
   `UnsavedChangesDialog` (Save / Don't save / Cancel — the brief-102
   three-button pattern), where Save runs the existing `saveToDisk`; only then
   call `load`.
2. Route the picker, the intent effect and the drop through it. For the intent
   effect, Cancel keeps the current document, and the intent is drained either
   way so it does not fire again on the next render.

## Acceptance

- Tests: dirty + drop → the dialog shows, and Cancel keeps the document and
  its dirty state; Don't save → the new document loads; Save → `saveToDisk`
  runs before the load; a clean document loads with no dialog.
- Typecheck, lint and the new vitest run green.
- In the browser: annotate, drop another PDF onto the window — you are asked.
