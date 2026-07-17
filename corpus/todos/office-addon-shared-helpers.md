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

Fix means expanding `@imbatranim/core`'s public surface (or a shared
add-on lib package) — a contract decision, hence a brief of its own
rather than a tail-end refactor. Until then any change to 413 handling
or the download endpoint's params must touch 3–4 places.
