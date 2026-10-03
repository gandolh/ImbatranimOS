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

## Outcome (2026-10-03)

Done as proposed, in one code commit. **Not grilled:** the brief asked for a grill
on the buttons and the first cut, and the run took the proposed decisions as they
stand.
- **Backend:**
  - The token is `${trunc(mtimeMs)}-${size}` (`versionOf`). `FileEntry`, the content
    read and the upload response carry `version`, and the download sends
    `X-File-Version`.
  - `writeFile` and `uploadFile` take an optional `expected`. A mismatch, including
    a file that is gone, is a 409 `{ current }` (`null` when gone), and nothing is
    written. Without a token, nothing changes.
  - The check runs just before the atomic write, not under a lock. Two writers in
    the same millisecond can still race, which is fine for a precondition aimed at
    a human-speed Terminal.
- **Protocol** (additions only, so `PROTOCOL_VERSION` stays 2):
  - `fs.readWithVersion` and an `upload(..., { expected })` option; `upload` now
    resolves `{ version }`.
  - `FileConflictError` (with `current`).
  - Kit: `FileConflictDialog` and `useFileConflict()`, whose `ask(name)` resolves
    `'overwrite' | 'reload' | 'cancel'`. Cancel has the focus, and Esc means Cancel.
- **Editors:** each keeps the token of its *saved baseline*, not of the latest
  read, because a refetch Notepad declines to adopt over unsaved edits must not move
  it.
  - Overwrite re-sends without a token.
  - Reload re-reads, and the next save builds on that version.
  - Code Editor's reload is a `pushEditOperations` edit, so Ctrl+Z gets the
    discarded text back. Notepad and Markdown Editor replace the text outright.
  - Save As onto another path sends no token: choosing a target is the decision.
  - Notepad's query comment now says what is true: no focus refetch, and the
    precondition is the guard.

**Acceptance:**
- Backend: 6 service specs and 2 e2e (stale token is 409 and the file is
  unchanged; an upload with a stale token is 409; the download header matches the
  upload's version). Backend totals: unit 464, e2e 124.
- One jsdom test per editor drives a real 409 through the dialog: the save sends
  the read version, each button does what it says, and a save after a save sends
  the version the first save wrote. Code Editor runs against a fake Monaco.
  - Notepad 45, Code Editor 22, Markdown Editor 113.
  - Core `fileBytes` 7: the header, the `expected` field, 409 → `FileConflictError`,
    and 413 still → `UploadTooLargeError`.
- Repo typecheck, lint and `format:check` 90/90; `npm test` 30/30.
- **Browser check (done later the same day, once Ward was back):** signed in
  through the local Ward and opened `notes.txt` in Notepad. A line was appended
  from outside, by a shell writing the same `FILES_ROOT`; the precondition cannot
  tell that from the Terminal app.
  - Typing and Save asked the question, and the disk kept the outside line.
  - **Reload from disk** showed both lines, with Save disabled.
  - A save with no outside change went straight through.
  - A second outside append, then Save → **Overwrite**, wrote my text.
  - Cancel was not walked in the browser; the unit tests cover it.
