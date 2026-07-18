# Brief 39 — Markdown editor with live preview

Status: **todo** · Promotes
[markdown-previewer-addon](../../todos/markdown-previewer-addon.md). Wave C.
Medium → sonnet. New package `apps/add-ons/markdown-editor/`. Controller
registers `.md`/`.markdown` in `openWith.ts`.

## Problem

Notepad is plaintext; web devs write markdown (READMEs, notes, docs) and want a
live-rendered preview. No markdown app exists.

## Decisions (grilled 2026-07-18)

- **Standalone app, not a Monaco mode.** The Code Editor (brief 41) is a separate
  heavy brief; a light, always-available markdown editor is worth shipping on its
  own and keeps Monaco out of this path. (If both later feel redundant, revisit —
  don't pre-couple.)
- **Reuse the existing renderer**: `react-markdown` + `remark-gfm` are already
  in the bundle (notepad). Use them — do **not** add a second markdown/rehype
  renderer.
- **Sanitize by not opting into raw HTML.** `react-markdown` escapes embedded
  HTML by default (no `rehype-raw`). Do NOT add `rehype-raw` — that's the
  injection guard. File contents render as markdown only, never as live HTML.
- **Layout**: split view (editor left `<textarea>`, preview right), with a
  toggle for editor-only / split / preview-only. Scroll each pane independently.
- **Full shared-kit editor**: `useOpenIntent` (load), `fetchFileBytes`/
  `uploadFileBytes` (bytes over authed api), `useSaveHotkey` (Ctrl/Cmd+S),
  `useUnsavedGuard` (close-guard), a dirty `•` indicator, explicit Save — mirror
  the office editors' save flow.
- **Routing**: `md` and `markdown` → `markdown-editor` for **all roots** (a
  strict upgrade — `md` previously routed to notepad in the notes root only, and
  the new editor is root-aware). Note the change in the outcome. Multi-instance.
- Deps: `@imbatranim/core`, `lucide-react`, `react-markdown`, `remark-gfm`
  (all hoisted; no new dependency).

## Fix

New package `apps/add-ons/markdown-editor/` (add-on scaffold). `src/index.ts`
manifest (`icon: FileText` or `Hash`, lazy, `multiInstance: true`).
`src/MarkdownEditor.tsx` (intent → text, textarea + `<Markdown remarkPlugins=
{[remarkGfm]}>` preview, view-mode toggle, save flow, dirty/guard). Prose styles
via core tokens (a scoped `.md-preview` class — keep it readable, no new palette).
**Controller**: switch `md` + add `markdown` in `EXTENSION_APP_MAP` (drop the
notes-only rule for `md`) + `openAppLabel` case in `openWith.ts`.

## Must preserve (regression surface)

Notepad still owns `txt/log/json/ts/...` in the notes root — only `md` moves.
`react-markdown` used without `rehype-raw` (no HTML injection). Save writes back
to the same `{root, path}` via `uploadFileBytes`; unsaved-guard blocks a lossy
close. StrictMode-safe intent drain (use the shared hook).

## Verify bar

`turbo typecheck`, lint + format green, build ok (own lazy chunk; renderer is
shared, not duplicated). **Human-gated:** open a `.md` from Files → renders live;
typing updates the preview; a `<script>`/raw-HTML snippet in the file renders as
text, does not execute; Save persists; close-with-unsaved warns; toggle modes
work.

## Invariants

Lightweight (no new dep), identity locked, all bytes over the authed api,
HTML-injection-safe by construction.

## Out of scope

Monaco/code-editor integration, syntax-highlighted code fences (unless it falls
out of the existing renderer for free), math/mermaid, WYSIWYG, export-to-PDF.

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped as `apps/add-ons/markdown-editor/`. Full shared-kit editor
(`useOpenIntent` + `fetchFileBytes`/`uploadFileBytes` + `useSaveHotkey` +
`useUnsavedGuard` + dirty • + explicit Save, mirroring Docs). Split view
(textarea | `<Markdown remarkPlugins={[remarkGfm]}>`), editor/split/preview
toggle, independent scroll. **`rehype-raw` deliberately NOT used** — react-
markdown's default HTML-escaping is the XSS guard. No new deps (react-markdown +
remark-gfm hoisted). Own lazy chunk (1.81 KB gz; renderer shared, not
duplicated). `multiInstance: true`. Routing: `md` + `markdown` → markdown-editor
for all roots (strict upgrade; notepad keeps txt/log/json/… in notes root).
Human-gated open/edit/save/no-HTML-exec check open.
