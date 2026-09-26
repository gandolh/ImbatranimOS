# Brief 142 — An interrupted backup download frees the backup slot

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · BACKEND
(`apps/backend/src/modules/backup/backup.controller.ts`, `download` only).
Independent of brief 149 but the same file — land one after the other.
Implement inline.

## Context

`GET /api/backup` (`backup.controller.ts:61-85`) streams `tar -czf -` with
`backup.stream.pipe(res)` (`:74`), awaits `backup.done`, and calls
`backup.dispose()` in `finally` (`:83`). `done` settles only on the tar child's
own `close` or `error` (`backup.service.ts:322-333`). `dispose()` is what kills
the child, resets `backupInFlight` (`backup.service.ts:150`) and deletes the
staging directory that holds the database snapshot.

If the browser disconnects mid-download (tab closed, network drop), `res`
closes and `.pipe()` unpipes and pauses tar's stdout. tar fills the ~64 KB pipe
buffer and blocks on `write()` forever: the child never exits, `done` never
settles, `dispose()` never runs. From then on every `GET /api/backup` answers
**409 "A backup is already running"** until the container restarts. A tar
process stays blocked, and a copy of the database sits in the staging
directory inside the home volume. `files.controller.ts:126-133` already uses
`pipeline` for downloads, with a comment naming this hazard.

## Files you OWN

- `apps/backend/src/modules/backup/backup.controller.ts` — `download` only
- `apps/backend/src/modules/backup/backup.service.ts` — `openBackupStream`
  only, if needed
- `apps/backend/src/modules/backup/backup.brief80.spec.ts`, or a new spec

## Files you must NOT touch

- The restore path (`apply`, `swapIn`, `installDatabase`) — briefs 149 and 154.

## What to do

Use `pipeline(backup.stream, res)` from `node:stream/promises`, or listen for
`res.on('close')`, so that **whichever side finishes first** calls
`backup.dispose()` — which already `SIGKILL`s a still-running child. Keep the
existing failure semantics: if tar fails after bytes have gone out, destroy the
socket so the client's gzip CRC fails and a partial backup never looks
complete.

## Acceptance

- A test that starts a download, destroys the client side after the first
  chunk, and asserts: the tar child is killed, `backupInFlight` is false, the
  staging directory is gone, and a second `GET /api/backup` succeeds.
- Existing brief-80 specs green.
