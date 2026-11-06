> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [notepad-takes-over-markdown-editors-job](../../todos/notepad-takes-over-markdown-editors-job.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 52 — Notepad takes over Markdown Editor's job

## Context

[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#4-drop-or-merge)
found two apps for one job:
- Notepad (`apps/add-ons/notepad`, 1,338 source lines) describes itself as
  "Markdown text editor". It has an edit/preview toggle with `react-markdown`
  and `remark-gfm`, find and replace, and opens `.txt` and `.log`.
- Markdown Editor (`apps/add-ons/markdown-editor`, 2,629 source and 1,091
  test lines, 199 kB in the build) opens `.md` and `.markdown`. On top of
  Notepad it has:
  - a split view with scroll sync (`hooks/useScrollSync.ts`,
    `lib/scrollSync.ts`);
  - an outline (`components/Outline.tsx`);
  - a format toolbar (`components/FormatToolbar.tsx`, `lib/formatActions.ts`);
  - code highlighting in the preview (`rehype-highlight`, `lib/highlight.ts`);
  - images and links resolved next to the file (`lib/assetPaths.ts`,
    `lib/linkTarget.ts`).

The owner approved folding Markdown Editor into Notepad on 2026-11-06
("looks good, write the briefs"). Notepad stays in the base image, so this
brief touches no other repo.

While here, a leftover: `apps/backend/src/modules/notes/` holds only
`dto/upsert-recent.dto.ts`, which nothing imports. Notepad's old two-route
notes module was deleted in August 2026, when recent files became their own
service (old brief 94).

## Owner decisions

Approved 2026-11-06: Markdown Editor goes and Notepad opens markdown. The
smaller calls, with the default this brief builds:

1. **What Notepad takes from Markdown Editor.** Default: all five pieces
   above. The edit/preview toggle gains a third mode, split. `.md` and
   `.markdown` files open in split; every other file keeps today's toggle
   and opens in edit.
2. **The id.** `markdown-editor` maps to `notepad` in `RETIRED_APP_IDS`
   (`apps/core/src/shared/store/retiredApps.ts`), so pins, startup entries,
   recents and an `.md` override move to Notepad once. Default: yes.

## What to do

1. Port the five pieces into Notepad, keeping their tests. Use Notepad's
   store and file handling; don't keep a second editor beside it. Notepad's
   `opens` gains `md` and `markdown`, and its meta gains Markdown Editor's
   words.
2. Delete `apps/add-ons/markdown-editor`, its line in `manifest.ts`, its
   lockfile entries, and `markdown-editor` from `TEXT_APP_IDS` in
   `apps/core/src/shared/registry/associations.ts`. Add the
   `RETIRED_APP_IDS` pair, and widen that list's comment: it says built-ins
   "left for imbatranim-office", and this pair is built-in to built-in. Update the tests that name it (Files' and the
   association tests).
3. Delete `apps/backend/src/modules/notes/`.
4. Walk in the dev container:
   - **Before**, with Markdown Editor pinned, on the startup list and set as
     the `.md` default: a `.md` with a relative image, a code block and four
     headings.
   - **After:** the pin, the startup entry and the default are Notepad's.
   - The `.md` opens split, scroll stays in sync, the outline jumps, the
     toolbar formats, the image shows, and the code block is highlighted.
   - A `.txt` opens as before.
5. Corpus: the research page's drop list, status, log.

## Files you OWN

- `apps/add-ons/notepad/`, `apps/add-ons/markdown-editor/` (deleted),
  `apps/core/src/manifest.ts` (one line), `retiredApps.ts`, `associations.ts`
  and their tests, `apps/backend/src/modules/notes/` (deleted),
  `package-lock.json`, the corpus pages in step 5

## Files you must NOT touch

- Other add-ons, apart from tests that name Markdown Editor.
- The kit (`packages/ui`).

## Acceptance

- The full test run is green; the build has no `MarkdownEditor` chunk.
- The walk in step 4 holds.
- **Owner check** after a deploy: an `.md` from Files opens in Notepad's split
  view on the phone and the desktop.
