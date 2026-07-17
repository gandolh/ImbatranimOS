# Task 22 — File-manager preview pane (yazi/Explorer-style)

> **Outcome (2026-07-17, done):** Landed in commit `2b014b2`. All
> acceptance verified live in the browser: text/image/mp4 previews (mp4
> playback driven to completion), 5.8 MB log → too-large card, .docx →
> metadata card, multi-select + directory cards, pane on/off + width
> persisted across reload (localStorage-backed hook — no zustand,
> keeping the zero-new-deps bar), auto-collapse below 640 px. Zero
> package.json changes. One justified out-of-scope fix: a pre-existing
> FileList bug (row clicks bubbled to the background's clear-selection
> handler) made mouse selection non-functional — one-line
> stopPropagation, without which the pane was unusable by mouse.
> Keyboard nav (Arrow/Enter) added to the list as part of
> selection-driven previewing.

## Context

From todos/file-preview-pane.md, grilled 2026-07-17. Locked decisions:

- **Extend the existing file-manager** — a toggleable right-hand
  preview pane, Explorer-style. NOT a new package, NOT a Quick-Look
  popup, NOT a second file manager.
- **Zero new dependencies**: text/code as plain monospace, images via
  `<img>`, audio/video via native `<audio>`/`<video>` on the download
  URL. Everything else (incl. pdf/office for now) gets a metadata
  card (icon, size, modified) — never an error. PDF/markdown-rendered
  previews are explicit "expand later".

Post-v1, non-gating; independent of briefs 19–21.

## Files you OWN

- `apps/add-ons/file-manager/` only (components, store/persistence,
  filesApi additions if any)

## What to do

1. Toolbar toggle button for the pane; pane state (on/off + width,
   drag-resizable) persists across sessions (component-local
   persistence, e.g. localStorage-backed store — match existing
   add-on store patterns).
2. Selection-driven preview of the single selected file:
   - **Text/code** (reuse the FileList extension knowledge): fetch via
     `GET /api/files/content`, render plain monospace, respect a size
     cap — check `stat` first and show a "too large to preview" card
     past ~1 MB.
   - **Images**: `<img>` on the authed download URL.
   - **Audio/video**: native elements on the download URL.
   - **Everything else / directories / multi-select**: metadata card.
3. Debounce selection changes and cancel/ignore stale fetches (arrow-
   key browsing must not queue N requests or flash wrong previews).
4. Keep the file list usable at small window sizes — the pane
   collapses or is hidden below a sensible min width.

## Acceptance

Toggling the pane on and arrow-keying through a folder previews text,
an image, and an mp4 correctly with no stale flashes; a 5 MB log file
shows the too-large card; a .docx shows the metadata card; pane
on/off + width survive a reload; no new package.json dependencies in
file-manager; root `turbo` build/typecheck/format:check green
(backend lint debt exempt).
