# Brief 140 — Notepad (and every JSON-body text save) writes atomically

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · BACKEND
(`apps/backend/src/modules/files/files.service.ts`). Independent; land it
before brief 155, which edits the same function. Implement inline.

## Context

`FilesService.writeFile` (`apps/backend/src/modules/files/files.service.ts:628-639`),
the handler behind `PUT /api/files/content`, writes in place:
`await fs.writeFile(abs, content, 'utf-8')` (`:636`). `fs.writeFile` truncates
the destination before writing. A full disk part-way through, an OOM kill or a
container restart leaves the file truncated or empty, with the old bytes
already gone.

`uploadFile`, three functions further down (`:659-710`), was fixed for exactly
this: it stages beside the destination and `rename`s over it, and its comment
names the hazard ("a failure part-way through… left the user's file truncated
and the original bytes gone"). The same comment claims "Every save in the OS
goes through here (Docs, Sheets, Slides, Notepad, Code Editor, …)". That is
**false for Notepad**: `apps/add-ons/notepad/src/api/notepadApi.ts:41,51` save
through `PUT /files/content`, as do the REST client's collections
(`collectionsApi.ts:69`) and the file manager's text writes (`filesApi.ts:41`).
Code Editor and Markdown Editor use `system.fs.upload` and are already safe.

## Files you OWN

- `apps/backend/src/modules/files/files.service.ts` — `writeFile`,
  `uploadFile`, and a new private helper
- `apps/backend/src/modules/files/files.service.spec.ts`

## Files you must NOT touch

- `files.controller.ts` routes and DTOs; the frontend.

## What to do

1. Extract `uploadFile`'s stage-then-rename block into one private helper, e.g.
   `writeAtomically(abs, write: (stagedPath: string) => Promise<void>)`: stage
   as `.<name>.imbatranim-<uuid>.part` in the destination's own directory, copy
   the existing file's mode onto the staged file, `rename` over the destination,
   remove the staged file on any failure — all inside `withDiskSpaceCheck`.
2. `writeFile` calls it with `fs.writeFile(staged, content, 'utf-8')`;
   `uploadFile` calls it with `fs.copyFile(tmpPath, staged)`.
3. Correct the `uploadFile` comment so it names both entry points.

## Must preserve

- `mkdir -p` of the parent; `resolveSafe` before any write; the existing
  disk-full translation; mode preservation.
- `createFile` stays a plain exclusive create — there are no old bytes to
  protect.

## Acceptance

- A spec that makes the staged write fail (an injected failing write, or an
  unwritable staging path) and asserts the original file's bytes are unchanged
  and no `.part` file remains.
- A spec that an existing file's mode survives `writeFile`.
- Backend unit + e2e green.

## Out of scope

- Detecting that the file changed on disk since it was opened — brief 155.
