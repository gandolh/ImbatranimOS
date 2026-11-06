---
title: Files handles archives, and Archive Manager goes
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Files handles archives, and Archive Manager goes

Files opens a zip or tarball like a folder, read-only, and extracts and compresses on its own through the OS's `archive` service. Archive Manager, which does nothing more than that, is deleted. This repo only.

Decided in the imbatranim-apps grill on 2026-11-06, under "the OS keeps the
minimum; apps add on top"
([decisions-marketplace-suites.md](../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)).
It replaces the todo that moved Archive Manager to Accessories. Grill the
open questions below when the work starts, then promote this to a numbered
brief.

## Open questions (grill before starting)

Settled on 2026-11-06:
- the `archive` service stays in the OS;
- Files opens archives like folders, read-only, and extracts and compresses
  itself;
- Archive Manager is dropped, and a richer archive app could come later as
  its own todo.

1. **Which formats open like a folder?** Proposed: the nine Archive Manager
   opens today (zip tar gz tgz bz2 tbz2 tbz xz txz). A single-file `.gz` or
   `.xz` with no tar inside offers Extract instead, since there is no folder
   to show.
2. **Where does Extract put things?** Proposed: Archive Manager's rule if it
   has one; otherwise a folder named after the archive beside it, with a
   number added when that name is taken.
3. **Do Archive Manager's pins and startup entry move to Files once, through
   a `RETIRED_APP_IDS` pair?** Proposed: yes, and a `.zip` default set to
   Archive Manager becomes Files.

## Draft brief

### Context

Archive Manager (`apps/add-ons/archive-manager`, 923 source and 52 test
lines) calls `http`, `intents`, `notify` and `window`, and opens zip tar gz
tgz bz2 tbz2 tbz xz txz. All its work is done by the `archive` module
(`apps/backend/src/modules/archive/`, 2,164 lines): `list`, `extract`,
`extract-job` with `job/:id` progress, and `compress`, inside the home
folder. Files' context menu runs Extract and Compress by opening the app
(`system.intents.openApp('archive-manager', …)` in `FileManager.tsx`).

### What to do

1. **Files, browsing.** An archive opens as a read-only folder view from
   `archive/list`, with a breadcrumb inside it. Write actions are disabled
   there and say why. Extract is offered on one entry, a selection or all.
2. **Files, Extract and Compress.** They call the `archive` service
   directly. A long extract shows its progress from `job/:id` in Files (or
   as a notification when Files closes), and a failure names the file.
3. **Remove Archive Manager:** its folder, its line in `manifest.ts`, its
   lockfile entries and its tests. Add the `RETIRED_APP_IDS` pair
   (question 3), with the list's comment widened for a built-in to
   built-in move.
4. **Walk in the dev container:**
   - a zip and a `.tar.gz` with folders open like folders;
   - extract one file, then all;
   - compress a selection;
   - a 200 MB archive shows progress;
   - an Archive Manager pin is now Files'.
5. Corpus: the research pages, status, log.

### Files you OWN

- `apps/add-ons/file-manager/` (archive browsing, Extract and Compress) and
  its tests
- `apps/add-ons/archive-manager/` (deleted), its `manifest.ts` line,
  `retiredApps.ts`, `package-lock.json`, the corpus pages

### Files you must NOT touch

- `apps/backend/src/modules/archive/`, unless browsing needs a small read-only
  addition, which the outcome then names.

### Acceptance

- Tests green; the walk holds; the build has no Archive Manager chunk.
