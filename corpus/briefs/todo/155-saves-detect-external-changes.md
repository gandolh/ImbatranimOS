# Brief 155 — Saves notice when the file changed on disk

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM–HARD ·
BACKEND (`files` write and upload) + the `packages/ui` protocol + CORE handle +
three editors. After brief 140 (same `writeFile`). **At least 3 independent
chunks → `plan-split-dispatch`.** Grill first: the dialog's buttons, and which
apps are in the first cut.

## Context

The OS's pitch is a real filesystem next to a real shell, so a file open in an
editor can change underneath it — a `git checkout` in the Terminal, a second
editor window, the REST client and Notepad on the same JSON. Every save today
is a blind overwrite:

- `PUT /files/content` and `POST /files/upload` take no precondition.
  `FileEntry` already returns `modifiedAt`
  (`apps/backend/src/modules/files/files.service.ts:25-37`), but nothing sends
  it back.
- Notepad's query claims the opposite.
  `apps/add-ons/notepad/src/queries/notepadQueries.ts:26-36`: "Never served
  stale: the file may have changed on disk (the Terminal is right there), and
  re-reading on focus is what makes an explicit-save editor safe", with
  `staleTime: 0`. But the shared client sets `refetchOnWindowFocus: false` for
  every query (`packages/ui/src/queryClient.ts:8`), and in TanStack Query
  "window focus" means the *browser tab*, not a desktop window — switching from
  the Terminal back to Notepad inside the desktop would never refetch either
  way.

**Failure:** open `notes.txt` in Notepad. In the Terminal,
`echo more >> notes.txt`. Back in Notepad, type one character and press Ctrl+S:
the Terminal's line is silently destroyed.

## Proposed decisions (ungrilled)

- Optimistic concurrency on `modifiedAt` + `size`, a cheap version token;
  content hashes are not worth reading large files for. Writes accept an
  optional `expected` token; a mismatch answers **409** with the current token.
- `system.fs` gains the option on write and upload, and a typed
  `ConflictError`; editors keep the token from their read.
- UI, using the kit's dialog pattern: **Overwrite**, **Reload from disk**
  (discard mine), **Cancel** (keep editing, for example to copy my text out).
  First cut: Notepad, Code Editor, Markdown Editor; the office editors later.
- Rejected: file watching (inotify) for this purpose. That is backlog row 135
  (live folders), a bigger capability; a precondition catches the dangerous
  case at the one moment it matters.

## Files you OWN

- `apps/backend/src/modules/files/{files.service.ts,files.controller.ts,dto/files.dto.ts}`
  and their specs
- `packages/ui/src/system.ts` (the protocol),
  `apps/core/src/system/createSystemHandle.ts`, `apps/core/src/lib/fileBytes.ts`
- the save paths and tests of `apps/add-ons/{notepad,code-editor,markdown-editor}`;
  correct Notepad's query comment

## Files you must NOT touch

- The office editors (Docs, Sheets, norPDF) in this cut.

## Acceptance

- Backend: a write or upload with a stale token → 409, file unchanged; a
  matching or absent token → today's behaviour (backward compatible).
- Each first-cut editor: a test that a 409 opens the dialog and each button
  does what it says.
- In the browser: the Notepad + Terminal scenario above asks instead of
  overwriting.
