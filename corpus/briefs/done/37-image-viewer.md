# Brief 37 — Image viewer add-on

Status: **todo** · Promotes [image-viewer-addon](../../todos/image-viewer-addon.md).
Wave C. Medium → sonnet. New package `apps/add-ons/image-viewer/`.
Controller also registers it in file-manager `openWith.ts`.

## Problem

Images only appear in the preview pane / metadata card — no dedicated viewer
with zoom/fit/rotate and folder next/prev.

## Decisions (grilled 2026-07-18)

- **Root-aware viewer**, like PDF Viewer/Slides. Drain the open intent with
  `useOpenIntent(windowId)` → `{ root, path }`; display via a native `<img>`
  whose `src` is `downloadUrl(root, path)` from `@imbatranim/core` (session
  cookie rides same-origin GET). No bytes-into-memory needed for display.
- **Controls**: zoom in/out + fit-to-window + 100%, rotate 90° L/R, and
  **next/prev through the same folder** (image files only, name-sorted, wraps).
- **Folder listing**: add-ons may not import the file-manager package, so define
  a thin `listDir(root, path)` in this package using core's `api`
  (`GET /files?root=&path=` returns `FsEntry[]` — read
  `apps/add-ons/file-manager/src/api/filesApi.ts` for the exact endpoint + type
  and mirror the shape locally). Derive the parent dir from the opened path,
  list it, filter to image extensions, find the current index.
- **View-only this brief.** Annotation/crop is explicitly deferred — reusing the
  Snipping Tool's annotation stack would require importing a sibling add-on
  (forbidden by the boundary rule) or first hoisting that stack into core. Note
  it as a future brief; don't do it here.
- **Extensions**: `png jpg jpeg gif webp bmp svg avif ico`. Register these →
  `image-viewer` in `openWith.ts` (any root; root-aware). Multi-instance OK.
- Zoom/pan via CSS transform (scale + translate); no rasterization dep.

## Fix

New package `apps/add-ons/image-viewer/` (add-on scaffold; deps
`@imbatranim/core` + `lucide-react`). `src/index.ts` manifest (`icon: Image`,
lazy, `multiInstance: true`). `src/ImageViewer.tsx` (intent → load, toolbar,
transform state, keyboard: ←/→ prev/next, +/− zoom, `0` fit, `r` rotate).
`src/api/listDir.ts` (thin core-`api` call + local `FsEntry` type + image filter).
**Controller** (not the subagent): add the image extensions to
`EXTENSION_APP_MAP` + an `openAppLabel` case in
`apps/add-ons/file-manager/src/lib/openWith.ts`.

## Must preserve (regression surface)

Preview pane behavior unchanged. `openWith.ts` edit is additive — existing
routes (pdf/pptx/xlsx/docx/notepad) untouched. A missing/failed image shows a
clean error, not a crash. Loading a new image in the same window resets
zoom/rotate.

## Verify bar

`turbo typecheck`, lint + format green, build ok (own lazy chunk).
**Human-gated:** double-click an image in Files opens the viewer; next/prev
cycles the folder's images; zoom/fit/rotate work; keyboard shortcuts work;
non-image or broken file errors gracefully.

## Invariants

Lightweight (no image libs — native `<img>` + CSS), identity locked. All bytes
cross the authed download URL (no bare fetch to elsewhere).

## Out of scope

Editing/annotation/crop, EXIF display, slideshow timer, thumbnails strip.

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped. `apps/add-ons/image-viewer/` (8 files): root-aware
(`useOpenIntent` → native `<img src={downloadUrl(...)}>`), zoom/fit(rotation-
aware)/100%/rotate via CSS transform, folder prev/next (own thin `listDir` over
core `api`, image-filtered, wraps), keyboard ←/→ +/− 0 r bound to a focusable
wrapper (multi-instance-safe). New-image load resets zoom/rotate via render-time
state adjustment (avoids the set-state-in-effect rule). Broken image → clean
error panel. No new deps. Own lazy chunk (2.68 KB gz). `multiInstance: true`.
Registered png/jpg/jpeg/gif/webp/bmp/svg/avif/ico → image-viewer in openWith.
Human-gated open/next/zoom check open.
