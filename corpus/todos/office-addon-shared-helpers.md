---
title: Consolidate duplicated office add-on helpers into a shared surface
created: 2026-07-17
status: captured
tags: [add-on, debt, core-contract]
---

# Consolidate duplicated office add-on helpers

The 2026-07-17 review pass over briefs 19–22 flagged three verbatim
duplications across the four new office add-ons (reuse debt, no runtime
bug — all copies go through core's authed api client):

- `src/api/fileBytes.ts` — byte-identical between docs and sheets
  (fetch + upload + 413 `UploadTooLargeError`), and between pdf-viewer
  and slides (fetch only). Four copies of the authed download/upload
  wrapper.
- `src/store/openedFileStore.ts` — the zustand one-shot open-intent
  store duplicated verbatim across all four packages.
- `triggerDownload()` in PdfViewer.tsx + Slides.tsx hand-builds the
  download URL, duplicating file-manager's `filesApi.ts` `downloadUrl()`.

The same review's CS-2 finding extends this: beyond the copied
`fileBytes` / `openedFileStore` / `downloadUrl` helpers, three whole
effects are hand-copied across Docs, Sheets, Slides, and PdfViewer too —

- the one-shot open-intent consumption effect (ref-guarded
  `consumeIntent` draining into the per-window store, see
  `apps/add-ons/docs/src/Docs.tsx:26-37`);
- the `isTopWindow` check plus the global Ctrl/Cmd+S save-hotkey handler
  (`apps/add-ons/docs/src/Docs.tsx:17-22` and `:173-184`);
- the `registerCloseGuard` / `updateTitle` unsaved-changes tracking
  (`apps/add-ons/docs/src/Docs.tsx:53-70`).

These should become shared hooks — `useOpenIntent`, `useSaveHotkey`, and
`useUnsavedGuard` — as part of the same shared-surface work.

Fix means expanding `@imbatranim/core`'s public surface (or a shared
add-on lib package) — a contract decision, hence a brief of its own
rather than a tail-end refactor. Until then any change to 413 handling
or the download endpoint's params must touch 3–4 places, and any change
to intent consumption, the save hotkey, or the close guard must touch
all four office add-ons.
