---
title: Notepad takes over Markdown Editor's job
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# Notepad takes over Markdown Editor's job

Notepad takes over Markdown Editor's job (it already calls itself a markdown editor), and Markdown Editor leaves the OS. The leftover notes DTO goes too. This repo only.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.


> PROMOTED 2026-11-06 to [brief 65](../briefs/done/65-notepad-takes-over-markdown-editors-job.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); Markdown Editor goes and Notepad opens markdown.

1. **Which of Markdown Editor's pieces does Notepad take?** Answered 2026-11-06: all five (split view with synced scrolling, outline, format toolbar, code highlighting in the preview, images and links resolved next to the file). `.md` and `.markdown` open in split; every other file keeps today's edit/preview toggle and opens in edit.
2. **Do Markdown Editor's pins, startup entries, recents and `.md` default move to Notepad once, through a `RETIRED_APP_IDS` pair?** Answered 2026-11-06: yes, once.

## Draft brief

### Context

[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#4-drop-or-merge)
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

### What to do

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

### Files you OWN

- `apps/add-ons/notepad/`, `apps/add-ons/markdown-editor/` (deleted),
  `apps/core/src/manifest.ts` (one line), `retiredApps.ts`, `associations.ts`
  and their tests, `apps/backend/src/modules/notes/` (deleted),
  `package-lock.json`, the corpus pages in step 5

### Files you must NOT touch

- Other add-ons, apart from tests that name Markdown Editor.
- The kit (`packages/ui`).

### Acceptance

- The full test run is green; the build has no `MarkdownEditor` chunk.
- The walk in step 4 holds.
- **Owner check** after a deploy: an `.md` from Files opens in Notepad's split
  view on the phone and the desktop.
