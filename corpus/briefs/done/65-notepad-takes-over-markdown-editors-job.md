# Brief 65 — Notepad takes over Markdown Editor's job

## Context

Two built-in apps do one job
([research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#4-drop-or-merge)).
Promoted from the todo `notepad-takes-over-markdown-editors-job`.
- **Notepad** (`apps/add-ons/notepad`, 1,338 source lines) describes itself as
  "Markdown text editor". It has an edit/preview toggle with `react-markdown`
  and `remark-gfm`, find and replace, and opens `.txt` and `.log`.
- **Markdown Editor** (`apps/add-ons/markdown-editor`, 2,629 source and 1,091
  test lines, 199 kB in the build) opens `.md` and `.markdown`. On top of
  Notepad it has:
  - a split view with synced scrolling (`hooks/useScrollSync.ts`,
    `lib/scrollSync.ts`);
  - an outline (`components/Outline.tsx`);
  - a format toolbar (`components/FormatToolbar.tsx`,
    `lib/formatActions.ts`);
  - code highlighting in the preview (`rehype-highlight`, `lib/highlight.ts`);
  - images and links resolved next to the file (`lib/assetPaths.ts`,
    `lib/linkTarget.ts`).

A leftover rides along: `apps/backend/src/modules/notes/` holds only
`dto/upsert-recent.dto.ts`, which nothing imports. Notepad's old notes module
was deleted in August 2026, when recents became their own service (old
brief 94).

## Owner decisions (settled 2026-11-06)

1. Notepad takes all five pieces. `.md` and `.markdown` open in a new third
   mode, split; every other file keeps today's edit/preview toggle and opens
   in edit.
2. `markdown-editor` maps to `notepad` in `RETIRED_APP_IDS`
   (`apps/core/src/shared/store/retiredApps.ts`), so pins, startup entries,
   recents and an `.md` default move to Notepad once.

## What to do

1. Port the five pieces into Notepad with their tests, on Notepad's store
   and file handling; no second editor beside it. Notepad's `opens` gains
   `md` and `markdown`, and its meta gains Markdown Editor's words.
2. Delete Markdown Editor:
   - `apps/add-ons/markdown-editor`, its `manifest.ts` line and its lockfile
     entries;
   - `markdown-editor` from `TEXT_APP_IDS` in
     `apps/core/src/shared/registry/associations.ts`.

   Add the `RETIRED_APP_IDS` pair and widen that list's comment, which says
   built-ins "left for imbatranim-office": this pair is built-in to built-in.
   Update the tests that name it.
3. Delete `apps/backend/src/modules/notes/`.
4. Walk in the dev container:
   - before: Markdown Editor pinned, on the startup list, and the `.md`
     default, with a `.md` holding a relative image, a code block and four
     headings;
   - after, the pin, the startup entry and the default are Notepad's;
   - the `.md` opens split with synced scrolling; the outline jumps, the
     toolbar formats, the image shows and the code is highlighted;
   - a `.txt` opens as before.
5. Corpus: the research pages, status, log.

## Files you OWN

- `apps/add-ons/notepad/`, `apps/add-ons/markdown-editor/` (deleted), the
  `manifest.ts` line, `retiredApps.ts`, `associations.ts` and their tests,
  `apps/backend/src/modules/notes/` (deleted), `package-lock.json`, the corpus
  pages

## Files you must NOT touch

- Other add-ons beyond tests that name Markdown Editor; the kit.

## Acceptance

- Full test run green; the build has no `MarkdownEditor` chunk; the walk holds.
- **Owner check** after a deploy: an `.md` from Files opens in Notepad's
  split view on the phone and the desktop.

## Outcome (2026-11-06)

Built and committed: `e8016ed` (1.198.0) and the fix `f743f0c`. Notepad opens
`.md` files in a split view with the ported preview, outline, toolbar and
scroll sync. The view choice is stored under `imbatranim:notepad:view`;
`rehype-highlight` ^7.0.2 became Notepad's dependency. The Markdown Editor
add-on and its backend notes module are deleted. `RETIRED_APP_IDS` gains
`markdown-editor` and `notepad`, and the `BUILT_IN_TARGETS` rule covers the
move. The main session also fixed Notepad's shortcut text and the tour.
Harmless comments about the old editor remain in `FileManager.tsx` (around
line 1081) and `files.service.ts` (around line 729).

- **Walk 2b (2026-11-06):** passed except one thing. Start pins were not
  migrated for retired ids. `f743f0c` fixes it: a retired app's Start pin moves
  to its replacement (`retiredApps.ts`).
- Ticket: ready for deploy.

Left for the owner: push imbatranim-apps first, then this repo, then deploy.
