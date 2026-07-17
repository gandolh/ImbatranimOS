# Brief 25 — Collapse the notes module onto /files (drop the duplicate surface)

Status: **done** (2026-07-17) · Promoted
[notes-module-duplicates-files-service](../../todos/notes-module-duplicates-files-service.md)
(CS-7, 2026-07-17 review).

## Outcome (2026-07-17)

Backend `notes` collapsed to `GET/POST /notes/recent` only — the 8
FilesService delegation methods, the `FilesService` dependency, and the
`file-ops`/`directory-ops`/`path-query` DTOs are gone. Notepad's
`notepadApi.ts` now hits `/files` with `root:'notes'` (list → `/files`,
read → `/files/content`, create/update → `PUT /files/content`, mkdir →
`POST /files/directory`, delete → `DELETE /files`; recents stay on
`/notes/recent`). `FilesService.ROOTS.notes` retained so File Manager and
Notepad share one validated surface over `data/notes`. `NoteEntry` is a
structural subset of `FileEntry`, so `types.ts` needed no change. Accepted
behavior change: `createFile` is now an upsert (no create-only `/files`
endpoint). No notes tests existed. Gates: backend 80 unit + 29 e2e green,
typecheck/lint/format clean. **Human-gated:** Notepad browse/open/edit/
save/delete + recents, and File-Manager parity over the notes root.

## Problem

The backend `notes` module is a pass-through to `FilesService` pinned to
`root='notes'` (`notes.service.ts:17-50`), with DTOs that restate the files
ones. Notepad talks to `/notes/*` while File Manager reaches the same
`data/notes` dir via `/files?root=notes` — two independently-validated HTTP
surfaces over identical data. Only `recent_files` is unique to notes.

## Fix (coordinated backend + notepad)

1. **Backend notes module → recent_files only.**
   - `notes.service.ts`: delete `list`/`readFile`/`createFile`/`updateFile`/
     `deleteFile`/`createDirectory`/`deleteDirectory` and the `FilesService`
     dependency; keep `getRecent`/`upsertRecent` (+ `DbService`).
   - `notes.controller.ts`: keep only `GET /notes/recent` and
     `POST /notes/recent`; remove the file/dir routes.
   - Delete now-dead DTOs: `dto/file-ops.dto.ts`, `dto/directory-ops.dto.ts`,
     and `dto/path-query.dto.ts` (added for the removed query routes). Keep
     `dto/upsert-recent.dto.ts`.
   - `notes.module.ts`: drop the `FilesModule`/`FilesService` import if it was
     only there for the delegation. Leave `FilesService.ROOTS.notes` intact —
     it now serves Notepad via `/files?root=notes`.
2. **Notepad client → /files with root='notes'.** Rewrite
   `apps/add-ons/notepad/src/api/notepadApi.ts` to call the `/files` endpoints
   directly through core's `api` (Notepad may NOT import file-manager — add-on
   boundary):
   - `fetchNotes(path)` → `GET /files?root=notes&path=`
   - `readFile(path)` → `GET /files/content?root=notes&path=`
   - `createFile(path, content='')` / `updateFile(path, content)` →
     `PUT /files/content { root:'notes', path, content }`
   - `deleteFile(path)` / `deleteDirectory(path)` →
     `DELETE /files?root=notes&path=`
   - `createDirectory(path)` → `POST /files/directory { root:'notes', path }`
   - `fetchRecent`/`upsertRecent` stay on `/notes/recent`.
   Keep the return shapes Notepad expects (map `/files` responses if the field
   names differ — `readContent` returns `{path, content}`, list returns
   `FileEntry[]`; adapt `NoteEntry`/`NoteFile` types if needed).

## Accepted behavior change (document, low risk)

`/files` has no create-only endpoint, so `createFile` becomes an upsert
(`PUT /files/content` overwrites if the path exists) rather than the old
create-that-throws-on-exists. Fine for single-user Notepad (new files use a
fresh name); note it in the outcome. If strict create-only is ever needed,
add a dedicated files endpoint rather than resurrecting the notes surface.

## Verify bar

Update/trim any notes backend tests to match the reduced surface. Backend
`npx jest` + `jest --config test/jest-e2e.json` green; `turbo typecheck`
13/13, `format:check` + lint clean; `turbo build` ok. **Human-gated:** open
Notepad, browse/open/edit/save/delete a note and a folder; recents still
populate; File Manager still sees the same files under the notes root.

## Invariants

Path-traversal jail unchanged (still `FilesService.resolveSafe`, root
`notes`). Auth unchanged (global guard). No new deps.
