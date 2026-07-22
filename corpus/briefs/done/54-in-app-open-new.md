# Brief 54 — In-app Open / New for viewer & editor apps

Status: **todo** · From the 2026-07-19 walkthrough (bug #3 of
[todos/app-walkthrough-bugs.md](../../todos/app-walkthrough-bugs.md)) +
[todos/code-editor-file-menu.md](../../todos/code-editor-file-menu.md). CORE
(shared picker) + several add-ons, frontend. **≥3 independent chunks →
`plan-split-dispatch` candidate.** Best sequenced **after brief 48** (the picker
is a natural `@imbatranim/ui` / `system.fs` + `system.intents` citizen) but does
not hard-depend on it.

## Problem

Image Viewer, Media Player, PDF Viewer (+ norPDF), Sheets, Slides, Markdown
Editor, and Code Editor all dead-end on the same empty state — *"Open a file
from Files"* — with **no Open button, no file picker, no drag-and-drop, and no
New**. The only way to get content into any of them is to launch File Manager
separately and open from there. For a desktop that wants to feel real this is a
UX gap bordering on a bug across 7+ apps. The Code Editor specifically wants a
VS-Code-style **File** menu (Open… + Open Recent), scoped by the user to v1.*
(post-1.0).

## Decisions (to confirm when grilled — recommendations inline)

- **Build one reusable Open-file picker in CORE**, backed by the existing files
  API (reuse the File Manager browser as a modal picker), exported from the core
  barrel (or `@imbatranim/ui` + `system.fs` post-brief-48). Every app opens the
  same dialog instead of each rolling its own. This is the load-bearing chunk.
- **Wire each app's empty state to it:** replace the passive "Open a file from
  Files" text with an actual **Open…** button (and drag-a-file-onto-the-window
  as a second path). Reuse each app's *existing* open-intent handler
  (`useOpenIntent`) so the file flows through the same code path as a double-
  click from Files — no per-app bespoke loading.
- **New / blank document where it makes sense:** Sheets, Slides, Markdown Editor,
  Code Editor get a **New** action (Notepad/Sheets/Docs already have a "New →"
  precedent). Viewer-only apps (Image Viewer, Media Player, PDF Viewer) get
  **Open** only — no "New".
- **Code Editor File menu (the captured item):** a top **File** menu with
  **Open…** (the shared picker) + **Open Recent** (a short client-persisted MRU,
  like other add-on stores). Fits the existing multi-tab + real-FS-save model; no
  backend change. Note: `apps/add-ons/code-editor/src` has been read-only to the
  working user before — unlock perms before implementing.
- **Drag-and-drop from File Manager onto an app window** is desirable but can be
  a follow-on if it complicates the first cut; the Open button + New are the
  floor.

## Fix (chunks — independently dispatchable)

1. **CORE picker.** New shared `OpenFilePicker` (modal file browser over the
   files API, root-aware) + a hook/entry on the core barrel. Chunk 1, unblocks
   the rest.
2. **Viewers.** Add an **Open…** button (→ picker → existing open-intent) to
   Image Viewer, Media Player, PDF Viewer / norPDF. No "New".
3. **Editors.** Add **Open…** + **New** to Sheets, Slides, Markdown Editor, and
   the Code Editor **File** menu (+ Open Recent MRU). Reuse each app's save flow.
4. *(optional)* drag-a-file-onto-the-window across all of the above.

## Must preserve (regression surface)

- The existing double-click / open-with path from File Manager still works
  unchanged for every app (the picker reuses the same intent handler).
- No new backend route for Open (reuse the files API + existing search/list).
- Each editor's Save / dirty-flag / unsaved-guard behavior is untouched.
- Eager desktop bundle unchanged — the picker is CORE (already loaded), the New
  templates are small; nothing regresses the brief-33 lazy boundaries.

## Verify bar

`turbo typecheck`, core + touched add-on lint/format, `turbo build` green. Unit/
RTL: picker returns a selection that drives the app's open handler; New creates a
blank doc. **Human-gated:** from each app's empty state, click **Open…**, pick a
file, confirm it loads identically to a File-Manager double-click; **New** in
each editor yields an editable blank doc that saves; Code Editor **File → Open
Recent** lists prior files.
