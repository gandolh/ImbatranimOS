# Task 19 — Office suite, part 1: PDF + Slides viewers

> **Outcome (2026-07-17, done):** Landed in commit `685012c`. Spike
> PASSED — Slides ships: pptx-preview rendered a real 11-slide deck
> legibly (synthetic pptxgenjs decks render empty — a "nothing rendered
> → Download" fallback covers unparseable decks). One deviation: PDF
> engine is pdfjs-dist used directly (cleaner lazy-loading than the
> specced react-pdf). ext→app map landed as
> file-manager `lib/openWith.ts` (drives double-click, Enter, context
> menu; notepad entries root-scoped). Both engines verified as separate
> lazy chunks; browser-verified paging/zoom + real-deck rendering. A
> Slides stale-render interleave found by the review pass was fixed in
> `b46f64e`. Notepad's StrictMode-unsafe intent pattern discovered and
> captured (todos/notepad-intent-strictmode.md).

## Context

First half of the office suite (todos/office-suite-addon.md, grilled
2026-07-17). Locked approach: **client-side JS engines only** — no
OnlyOffice/Collabora server, no LibreOffice in the image (conflicts with
the slim-container identity). Two view-only apps plus the file-manager
plumbing that both office briefs share. Google-flavored naming.
Post-v1: queued after brief 15; does not gate the v1.0 tag.

Scope split: viewers here; editors (Sheets/Docs, heavier, carries the
AGPL step) are brief 20.

## Files you OWN

- `apps/add-ons/pdf-viewer/` — new package `@imbatranim/pdf-viewer`,
  app "PDF Viewer" (react-pdf / pdf.js, MIT)
- `apps/add-ons/slides/` — new package `@imbatranim/slides`, app
  "Slides" (best-effort pptx renderer, e.g. pptx-preview — spike-gated)
- `apps/core/src/manifest.ts` — two new registry lines
- `apps/add-ons/file-manager/src/FileManager.tsx` — replace the
  hardcoded `openApp('notepad', …)` at the double-click site with an
  extension→appId map (md/txt/log/code → notepad stays; pdf →
  pdf-viewer; pptx/ppt → slides; map is extended by brief 20)

## What to do

1. **Spike (gate)**: render 2–3 real-world decks with the chosen pptx
   library in a throwaway harness. Bar: typical text+image decks are
   legible. If it fails badly, cut the Slides app from this brief,
   note it in log.md, and ship PDF Viewer alone.
2. Scaffold both packages following the notepad/file-manager pattern
   (package.json exports, tsconfig extending `apps/add-ons/tsconfig.base.json`,
   manifest exporting AppConfig, core public-surface imports only).
3. Both apps accept the notepad-style open payload
   (`openApp(id, { openPath })`) and fetch bytes as a blob from
   `GET /api/files/download` via core's authed api client. Opened with
   no payload → simple empty state ("Open a file from Files").
4. PDF Viewer: page navigation, zoom in/out/fit, page N of M. That's
   the whole v1 surface.
5. Slides: render slides scrollable or paged; a visible "best-effort
   preview" hint and a Download button as the fidelity escape hatch.
6. **Lazy-load the engines**: pdf.js and the pptx renderer must be
   dynamic-import chunks, not in the core bundle (lightweight is
   identity — desktop boot cost must not change).
7. File-manager ext→app map + icons for pdf/pptx in FileList.

## Acceptance

Double-clicking a .pdf in Files opens PDF Viewer with working
paging/zoom; a typical .pptx opens legibly in Slides (or Slides was
cut via the spike gate and logged); engines load as separate chunks;
no unauthenticated fetches; root `turbo` build/typecheck/format:check
green (backend lint debt exempt as per todos/lint-format-debt.md);
README's add-on how-to still accurate.
