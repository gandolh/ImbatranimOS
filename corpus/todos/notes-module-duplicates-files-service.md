---
title: notes module is a thin duplicate wrapper over FilesService
created: 2026-07-17
status: captured
tags: [backend, debt, core-contract]
---

# notes module duplicates FilesService over a fixed root

Found in the 2026-07-17 review pass (CS-7). The backend `notes` module is
almost entirely a pass-through to `FilesService` pinned to a fixed
`NOTES_ROOT`: `list`, `readFile`, `createFile`, `updateFile`,
`deleteFile`, `createDirectory`, and `deleteDirectory` all delegate
straight to it (`apps/backend/src/modules/notes/notes.service.ts:17-50`).
Its DTOs mirror the files ones —
`apps/backend/src/modules/notes/dto/file-ops.dto.ts` and
`directory-ops.dto.ts` restate `apps/backend/src/modules/files/dto/files.dto.ts`.

The two consumers have diverged over the same `data/notes` directory:
Notepad calls the `/notes/*` surface
(`apps/add-ons/notepad/src/api/notepadApi.ts`), while the File Manager
reaches the same files through `/files?root=notes`
(`apps/add-ons/file-manager/src/api/filesApi.ts`). That is two
independently-validated HTTP surfaces over identical data. Only
`recent_files` is genuinely unique to notes
(`notes.service.ts:52-67`, `getRecent` / `upsertRecent`).

Suggested approach: collapse the notes module down to just the
`recent_files` endpoints and have Notepad read/write through `/files`
with `root=notes`, deleting the duplicated file/directory DTOs and
delegation methods.

Deferred because it is a cross-cutting API-contract change spanning the
backend and the Notepad add-on — needs a coordinated migration, not an
in-place edit.
