# Brief 66 — Files handles archives, and Archive Manager goes

## Context

Under "the OS keeps the minimum; apps add on top"
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)),
Files handles archives itself and Archive Manager, which does nothing more,
is deleted. Promoted from the todo
`files-handles-archives-and-archive-manager-goes`.

Archive Manager today:
- `apps/add-ons/archive-manager`, 923 source and 52 test lines;
- calls `http`, `intents`, `notify` and `window`;
- opens zip tar gz tgz bz2 tbz2 tbz xz txz.

All its work is the `archive` module's (`apps/backend/src/modules/archive/`,
2,164 lines): `list`, `extract`, `extract-job` with `job/:id` progress, and
`compress`, all inside the home folder. Its default destination is already a
rule: `deriveDest` and `freeDest` give a folder named after the archive,
beside it, numbered when the name is taken. Files' context menu runs Extract
and Compress by opening the app
(`system.intents.openApp('archive-manager', …)` in `FileManager.tsx`).

## Owner decisions (settled 2026-11-06)

1. **Opening.** The nine types open in Files like a folder, read-only, the
   way Windows Explorer opens zips. A lone `.gz` or `.xz` with no tar inside
   offers Extract instead, since there is no folder to show.
2. **Extract asks where:** a folder picker that defaults to the existing
   rule. Extract works on one entry, a selection or everything.
3. **Pins and defaults.** `archive-manager` maps to `file-manager` in
   `RETIRED_APP_IDS`, so pins and the startup entry move once, and a `.zip`
   default set to Archive Manager becomes Files.

## What to do

1. **Browsing.** An archive opens as a read-only folder view from
   `archive/list`, with a breadcrumb inside it. Write actions are disabled
   there and say why.
2. **Extract and Compress** call the `archive` service directly. Extract
   picks its destination per decision 2. A long extract shows `job/:id`
   progress in Files, or as a notification once Files is closed, and a
   failure names the file.
3. **Remove Archive Manager:** its folder, its `manifest.ts` line, its lockfile
   entries and its tests. Add the `RETIRED_APP_IDS` pair and widen the list's
   comment, as brief 65 does.
4. **Walk** in the dev container:
   - a zip and a `.tar.gz` with folders open like folders;
   - extract one file, then all, into a picked folder;
   - compress a selection;
   - a 200 MB archive shows progress;
   - an Archive Manager pin is now Files'.
5. Corpus: the research pages, status, log.

## Files you OWN

- `apps/add-ons/file-manager/` (archive browsing, Extract, Compress) and its
  tests
- `apps/add-ons/archive-manager/` (deleted), its `manifest.ts` line,
  `retiredApps.ts`, `package-lock.json`, the corpus pages

## Files you must NOT touch

- `apps/backend/src/modules/archive/`, unless browsing needs a small read-only
  addition, which the outcome names.

## Acceptance

- Tests green; the walk holds; the build has no Archive Manager chunk.

## Outcome (2026-11-06)

Built and committed: `712538b`. Files opens nine archive types like folders
(`archiveView`, `extractJob`, `ExtractDialog`). The Archive Manager add-on is
deleted. `RETIRED_APP_IDS` gains `archive-manager` and `file-manager`, and
`file-manager` is now in `BUILT_IN_TARGETS`.

- **Walk 2b (2026-11-06):** passed.
- **Accepted gaps:**
  - A lone `.gz`, `.xz` or `.bz2` file fails with "Unsupported archive
    format", because the backend's `detectFormat` only knows zip and tar
    flavours. Todo: [files-extracts-lone-compressed-files](../../todos/files-extracts-lone-compressed-files.md).
  - A refused zip-slip archive leaves an empty destination folder.
  - The kit's `fs.pickDirectory` has no start-folder option, so the extract
    dialog cannot pre-select the archive's folder. Todo:
    [pick-directory-starts-in-a-folder](../../todos/pick-directory-starts-in-a-folder.md).
- Ticket: ready for deploy.

Left for the owner: push imbatranim-apps first, then this repo, then deploy.
