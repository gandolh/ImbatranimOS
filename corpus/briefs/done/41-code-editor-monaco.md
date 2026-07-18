# Brief 41 — Code editor (Monaco)

Status: **todo** · Promotes [code-editor-monaco](../../todos/code-editor-monaco.md).
Wave D. **HARD → senior/opus.** New package `apps/add-ons/code-editor/`.
Client-only (no backend), but a heavy dep that MUST stay lazy + self-hosted.

## Problem

No real code editor — Notepad is a plain `<textarea>`. Web/low-level devs want
syntax highlighting, multi-file tabs, find/replace, and real FS save.

## Decisions (grilled 2026-07-18)

- **Monaco, self-hosted, lazy.** Add `monaco-editor` (+ `@monaco-editor/react`).
  The app shell is already `React.lazy` (brief 33); keep Monaco's own import
  dynamic so Monaco lands in the editor's lazy chunk, never the eager bundle.
- **NO CDN.** The CSP blocks external hosts (`connect-src`/`script-src`), so the
  default `@monaco-editor/react` CDN loader WILL fail. Configure it to use the
  **bundled** monaco: `import * as monaco from 'monaco-editor'; loader.config({
  monaco })`, and wire Monaco's web workers via Vite's `?worker` imports through
  `self.MonacoEnvironment.getWorker` (editor + ts/json/css/html workers) so
  everything is served same-origin from our own bundle. **This worker/CDN wiring
  is the hard, spike-worthy part — verify a built (not just dev) bundle loads
  the workers with no external request.**
- **Real FS via the shared kit**: `useOpenIntent` (open a file), `fetchFileBytes`
  /`uploadFileBytes` (bytes over the authed api), `useSaveHotkey` (Ctrl/Cmd+S),
  `useUnsavedGuard` (close-guard), dirty `•`, explicit Save — same flow as the
  office editors / markdown editor.
- **Multi-tab / multi-file** within one window: a tab strip of open files, each
  its own Monaco model; find/replace is Monaco's built-in. Language auto-detected
  from extension.
- **Routing**: register common code extensions → `code-editor` for **all roots**
  (a strict upgrade — code files previously routed to Notepad in the notes root
  only, and Monaco is root-aware). Keep Notepad for `txt`/`log`. Multi-instance.
- **LSP / IntelliSense beyond Monaco's built-in TS worker is out of scope.**

## Fix

New package `apps/add-ons/code-editor/` (add-on scaffold; deps `@imbatranim/core`,
`lucide-react`, `monaco-editor`, `@monaco-editor/react`). `src/index.ts` manifest
(`icon: Code2`, lazy component, `multiInstance: true`). `src/CodeEditor.tsx`
(tab state, models, save flow), `src/monacoSetup.ts` (loader.config + worker env
— the self-host wiring), `src/language.ts` (ext→language map). **Controller**:
add code extensions to `openWith.ts` (`ts tsx js jsx json css html sh py c cpp h
hpp go rs java rb php yaml yml toml xml sql` — move them off the notes-only
Notepad rule) + an `openAppLabel` case; add the manifest entry; `npm install`.

## Must preserve (regression surface)

- **No external request at runtime** — the whole app is offline; a CDN fetch for
  monaco would break behind the CSP and offline. Verify from the build.
- Notepad still owns `txt`/`log` in the notes root; only code extensions move.
- Save writes back to the same `{root, path}`; unsaved-guard blocks a lossy
  close; StrictMode-safe open (shared hook).
- Office engines + other lazy chunks unaffected; the eager bundle must NOT grow
  (Monaco stays in the editor chunk) — **measure eager gzip before/after**.

## Verify bar

`turbo typecheck`, code-editor lint + format green, `turbo build` ok. **Build
acceptance:** Monaco + its workers emit as code-editor-owned chunks/workers;
eager `index-*.js` gzip essentially unchanged; grep the built assets to confirm
no CDN URL. **Human-gated:** open several code files → tabs, highlighting,
find/replace (Ctrl+F/H), Save persists, close-with-unsaved warns, no network
error in console, workers load.

## Invariants

Lightweight is identity — Monaco is heavy but **fully lazy + self-hosted**, so
boot cost is unchanged (the justification for the dep). No CDN (offline + CSP).
Identity/layout locked. All bytes over the authed api.

## Out of scope

LSP/language servers, extensions/marketplace, integrated terminal (Terminal app
exists), git decorations (git-gui is brief 42), debugger, settings-sync,
minimap-tuning beyond defaults.

## Outcome (2026-07-18) — Wave D commit `4be1777`

Shipped. `apps/add-ons/code-editor/`: `monacoSetup.ts` does `loader.config({
monaco })` (bundled instance, not the CDN loader) + a `self.MonacoEnvironment.
getWorker` returning Vite `?worker` chunks (editor/ts/json/css/html) — all
same-origin. Multi-tab (one model per file, view-state preserved), language by
extension, Monaco's built-in find/replace, real-FS save flow (`useOpenIntent` +
`fetchFileBytes`/`uploadFileBytes` + `useSaveHotkey`/`useUnsavedGuard`, dirty •).
Deps added: `monaco-editor` + `@monaco-editor/react` (justified: fully lazy).
**Build-verified: Monaco + workers are code-editor-owned lazy chunks; eager
`index-*.js` gzip unchanged (125.04 KB).** The one `cdn.jsdelivr.net` string in
the chunk is `@monaco-editor/react`'s inert default (bypassed by `loader.config`,
and the CSP would block it regardless — fails closed). Code exts (ts/tsx/js/jsx/
json/css/html/sh/py/c/cpp/h/hpp/go/rs/java/rb/php/yaml/yml/toml/xml/sql) rerouted
from notepad → code-editor (all roots); notepad keeps txt/log. `multiInstance:
true`. Human-gated: open code files, tabs/highlighting/find/save, no network error.
