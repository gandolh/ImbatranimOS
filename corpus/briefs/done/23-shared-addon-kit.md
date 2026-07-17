# Brief 23 — Shared add-on kit: dedupe the office/add-on spine into @imbatranim/core

Status: **done** (2026-07-17) · Promoted the CS-1/CS-2/CS-8 and CS-12 todos
(both removed on completion), surfaced by the 2026-07-17 review pass.

## Outcome (2026-07-17)

Landed via plan-split-dispatch: 1 senior core-surface chunk + 8 consumer
chunks (docs senior; sheets/slides/pdf-viewer + file-manager + bookmarks +
sticky-notes + notepad junior). `@imbatranim/core` now exports
`fetchFileBytes`/`uploadFileBytes`/`UploadTooLargeError`/`downloadUrl`/
`fileName`, `createOpenedFileStore`, `useOpenIntent`/`useSaveHotkey`/
`useUnsavedGuard`, and `ConfirmDialog`/`useConfirm`. All four document
add-ons deleted their local `api/fileBytes.ts` + `store/openedFileStore.ts`
(8 files); the download buttons in slides/pdf-viewer + file-manager route
through core `downloadUrl`; bookmarks/sticky-notes/notepad dropped native
`confirm()` for the themed dialog (file-manager kept its existing themed
delete Dialog — already correct — a deliberate scope trim). Net −333 LOC.
Verify bar met: turbo typecheck 13/13, format 14/14, lint 13/13, build ✓,
no local copies / native `confirm()` remain. A 2-finder review (opus
integration + sonnet core-logic) confirmed the single shared store is a
safe singleton (uuid windowIds, multiInstance) and hook parity is exact;
its findings — `useConfirm` re-entrancy + unmount promise-hang, a
param-shadow, and a sheets fallback drift — were fixed. **Human-gated
remainder:** the in-browser walkthrough (open docx/xlsx, Ctrl+S, close-dirty
prompt, delete-confirm) per the verify bar. Follow-up nits captured in
[add-on-cleanup-nits](../../todos/add-on-cleanup-nits.md).

## Goal

The four document add-ons (docs, sheets, slides, pdf-viewer) each carry a
hand-copied file-I/O layer, per-window open-file store, and open/save/close
lifecycle effects; three add-ons implement "confirm a destructive action"
three different ways. Collapse the shared spine into `@imbatranim/core`'s
public barrel so there is one copy of each, then migrate every consumer.
**No behavior change** — this is a reuse/consolidation refactor. Prod runtime
output must be identical; the only observable change is uniform confirm UX
(CS-12) replacing native `confirm()` / no-confirm.

## Why now / why a brief

The copies have already diverged (pdf-viewer/slides lack `uploadFileBytes`)
and any fix to 413 handling, the download endpoint, the StrictMode-safe
intent drain, or the save-hotkey must touch 3–4 places. Expanding core's
surface is "an API decision" (see `apps/core/src/index.ts` header), hence a
brief rather than a tail-end refactor.

## Decisions (locked for this brief)

- **Expand `@imbatranim/core`**, do not add a new package. New exports cross
  the existing barrel (`apps/core/src/index.ts`); the eslint add-on boundary
  already permits `@imbatranim/core` imports. No new dependencies.
- `ConfirmDialog` is built on core's existing `Dialog`.
- Decompose the implementation **by add-on**, not by concern: the core
  surface lands first (wave 1), then each consumer migrates independently
  (wave 2). This avoids parallel edits colliding on the same files.
- Keep the StrictMode-safe pattern verbatim (ref-guarded one-shot intent
  drain via `useIntentStore.getState().consumeIntent` — never in a render
  selector). See `apps/add-ons/docs/src/Docs.tsx:26-37`.

## The shared surface to add to `@imbatranim/core`

New modules under `apps/core/src/`, all re-exported from `src/index.ts`:

1. **File bytes** (`lib/fileBytes.ts`) — lift verbatim from
   `apps/add-ons/docs/src/api/fileBytes.ts` (the fullest copy):
   `fetchFileBytes(root, path)`, `uploadFileBytes(root, path, bytes, fileName)`,
   `UploadTooLargeError`, and the internal `hasHttpStatus`. Also add
   `downloadUrl(root, path)` (lift from
   `apps/add-ons/file-manager/src/api/filesApi.ts`) and `fileName(path)`
   (the helper duplicated in Docs/Sheets/PdfViewer/Slides — keep a sensible
   default-name param).
2. **Opened-file store factory** (`shared/store/createOpenedFileStore.ts`) —
   a `createOpenedFileStore()` returning the zustand hook currently copied as
   `openedFileStore.ts` in all four add-ons (`OpenedFile`, `fileMap`,
   `setFile`, `clearFile`). Factory (not a singleton) so each add-on keeps an
   isolated instance.
3. **Lifecycle hooks** (`shared/hooks/`):
   - `useOpenIntent(windowId): OpenedFile | null` — owns the ref-guarded
     one-shot intent drain + per-window latch (wraps a store from #2).
   - `useSaveHotkey(windowId, onSave)` — Ctrl/⌘+S for the **top-most visible**
     window only (absorbs `isTopWindow`, `Docs.tsx:17-22,173-184`).
   - `useUnsavedGuard(windowId, isDirty, title)` — `registerCloseGuard`
     (reads latest dirty via ref) + `updateTitle` with the `•` marker
     (`Docs.tsx:53-70`).
4. **Confirm UX** (`shared/components/ui/ConfirmDialog.tsx` + a
   `useConfirm()` hook) — themed confirm built on core `Dialog`; returns a
   promise/`confirm(opts)` API. Export both.

## Migration (wave 2 — one consumer per chunk)

- **docs, sheets, slides, pdf-viewer**: delete local `api/fileBytes.ts` and
  `store/openedFileStore.ts`, remove the local `fileName`/`isTopWindow`
  copies, and adopt the core imports + the three hooks. (sheets/docs use
  `uploadFileBytes`; pdf-viewer/slides are read-only — they take
  `fetchFileBytes`/`downloadUrl` only.)
- **file-manager**: use core `downloadUrl`; adopt `ConfirmDialog`/`useConfirm`
  for its delete flow (currently a bespoke themed `Dialog` — unify, keep
  behavior).
- **bookmarks**: replace native `confirm()` (delete-group) and the
  no-confirm delete-link with `useConfirm`.
- **sticky-notes**: add a confirm to note deletion via `useConfirm`.
- **slides/pdf-viewer download buttons**: route through core `downloadUrl`
  (CS-8) — no more hand-built `/files/download?...` URLs.

## Acceptance criteria / verify bar

- No `fileBytes.ts` or `openedFileStore.ts` remains under `apps/add-ons/*`;
  no local `fileName`/`isTopWindow` copies; no native `confirm()` in add-ons.
- `@imbatranim/core` barrel exports the new surface; add-on eslint boundary
  still passes (only barrel imports).
- `npx turbo typecheck` 13/13, `format:check` 14/14, add-on lint green.
- Backend tests unaffected (no backend change).
- **Browser check** (per the project verify bar): open a docx in Docs and a
  file in Sheets from Files, edit → Ctrl+S saves, close-with-dirty prompts,
  title shows `•`; open a PDF/PPTX and download; delete a bookmark and a
  sticky note via the new confirm. Behavior identical to before.
- One commit on `main` when green (routing commit policy).

## Invariants touched

Internet-exposable auth (file bytes must keep crossing the authed `api`
client — no bare `<a>`/`fetch`, or a 401 won't drop to the lock screen);
lightweight (no new deps); identity/layout unchanged.
