# Brief 30 — Add-on polish: notepad StrictMode + themed prompt + dead deps

Status: **done** (2026-07-17) · Promoted the notepad-intent-strictmode and
add-on-cleanup-nits todos (both removed on completion).

## Outcome (2026-07-17)

All three parts landed. (1) Notepad drains the open intent in a
`consumedRef`-guarded effect via `useIntentStore.getState().consumeIntent`
(StrictMode-safe), preserving `setEditor` + `upsertRecent`; core's
`useOpenIntent` was deliberately not adopted (notepad's payload is
`{openPath}` only). (2) New `PromptDialog` + `usePrompt` in `@imbatranim/core`
(sibling of ConfirmDialog, same re-entrancy + unmount safety):
`prompt(opts) => Promise<string | null>`, confirm disabled on empty, returns
the trimmed value; notepad's new-file/new-dir handlers use it (native
`window.prompt` gone from the shell). (3) Dropped the dead `zustand` dep from
docs/sheets/slides/pdf-viewer and regenerated the root lockfile via
`npm install` (4 insertions / 8 deletions, no stray changes). Gates:
typecheck 13/13, build ✓, format 14/14, lint 13/13. **Human-gated:**
open-from-Files into Notepad + the themed name prompts.

## Three small, related cleanups

1. **Notepad StrictMode-safe intent drain.** `Notepad.tsx:10` consumes the
   one-shot open intent in a RENDER SELECTOR
   (`useIntentStore((s) => s.consumeIntent(windowId))`) — under StrictMode's
   double render the first pass drains it before paint, so open-from-Files can
   arrive empty. Notepad's payload is `{ openPath?: string }` (no `root`), and
   its model is a path string in `notepadStore.editorMap` + an `upsertRecent`
   call — so core's `useOpenIntent` (which needs `{openPath, root}` and latches
   an `OpenedFile`) does NOT fit. Fix minimally: drain in a **ref-guarded
   effect** via `useIntentStore.getState().consumeIntent(windowId)` (the same
   pattern `useOpenIntent` uses internally), preserving the existing
   `setEditor(windowId, openPath)` + `upsertRecent.mutate(openPath)` flow.

2. **Themed prompt for new file/dir names.** `FileBrowser.tsx:26,34` use
   native `window.prompt(...)` — out of place in the custom shell (the confirm
   was already themed in brief 23). Add a shared `PromptDialog` + `usePrompt`
   to `@imbatranim/core` (sibling of `ConfirmDialog`, built on `Dialog` +
   `Input` + `Button`): `const { prompt, promptDialog } = usePrompt()` where
   `prompt(opts:{title; message?; placeholder?; initialValue?; confirmLabel?})
   : Promise<string | null>` (null on cancel/dismiss; render `promptDialog`
   once; apply the SAME re-entrancy + unmount safety as `useConfirm`). Rewire
   FileBrowser's new-file/new-dir handlers to `await` it (alias the returned
   `prompt` to avoid shadowing the global).

3. **Drop dead `zustand` deps.** After brief 23, docs/sheets/slides/pdf-viewer
   no longer import `zustand` directly (they use core's
   `createOpenedFileStore`/`useOpenIntent`; core owns zustand). Remove
   `zustand` from those four `package.json` `dependencies` and regenerate the
   single root lockfile with `npm install` (do NOT hand-edit the lockfile).

## Verify bar

`turbo typecheck` 13/13, `format:check` 14/14, lint 13/13, `turbo build` ok;
`npm install` clean (lockfile updated, no stray changes). **Human-gated:**
open-from-Files into Notepad lands on the file (dev StrictMode); new
file/folder prompts are themed; the four apps still open/edit/save.

## Invariants

No behavior change beyond the themed prompt; no new deps (net removal). Core
public surface grows by `PromptDialog`/`usePrompt` (an API decision — mirror
`ConfirmDialog`).
