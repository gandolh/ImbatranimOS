# Brief 154 — A restore that cannot open its database puts everything back

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM · BACKEND
(`apps/backend/src/modules/backup/backup.service.ts` apply path,
`apps/backend/src/db/db.service.ts`). After brief 150 (same `db.service.ts`).
Low likelihood, irreversible when it happens. Implement inline.

## Context

Before committing, `apply()` checks only that the snapshot member **exists**
(`backup.service.ts`, the `snapshotStaged` check just before `swapIn`). Then
`swapIn` (`:530-571`) moves the live top-level entries into `rollbackAbs` and
the backup's into place, and `installDatabase` (`:588-600`) calls
`db.replaceWith(snapshot)` (`:598`). `replaceWith` (`db.service.ts:91-107`)
renames the snapshot over the live database and reopens it in a `finally`.

If the snapshot is not a SQLite database — a hand-edited archive, a corrupted
member inside a valid gzip — the reopen's first `pragma` throws
`SQLITE_NOTADB` **before** `migrate()` can set `migrationFailure`. Routes then
answer 500 instead of brief 110's honest 503. After that:

- `apply()`'s `finally` deletes `rollbackAbs` unconditionally (`:517`) — the
  moved-aside pre-restore home entries — and `swapIn`'s undo runs only on
  `swapIn`'s own failure. **The pre-restore state is gone.**
- On the next start, `DbService.onModuleInit` (`db.service.ts:48-52`) opens the
  same file with no guard. The throw escapes Nest's bootstrap, and
  `void bootstrap()` in `main.ts` has no handler, so the container
  **crash-loops** — the outcome brief 110 built degraded mode to avoid ("a
  restart-looping container with no UI, and on the kiosk ISO no host shell to
  read why").

## Files you OWN

- `apps/backend/src/modules/backup/backup.service.ts` — `apply`, `swapIn`'s
  return value, `installDatabase`
- `apps/backend/src/db/db.service.ts` — `onModuleInit`, `replaceWith`
- their specs

## What to do

1. Before `swapIn`: open the staged snapshot read-only with better-sqlite3, run
   `PRAGMA quick_check`, and read `user_version`. Refuse the restore (400,
   nothing moved) if either fails, or if `user_version` is newer than this
   build's ledger knows.
2. Make an `installDatabase` failure roll back: `swapIn` returns its undo list,
   and on any error after it, run the undo in reverse **before** the `finally`
   deletes `rollbackAbs`.
3. `replaceWith`: keep the previous database file aside until the new one has
   opened and migrated; if it fails, put the old one back and reopen it.
4. `onModuleInit`: catch open and `pragma` failures, set `migrationFailure`
   with the reason, and keep booting — `StorageHealthGuard` then answers 503
   and `/health` reports `degraded`, as for a failed migration.

## Acceptance

- Specs: a backup whose `db.sqlite` is random bytes is refused at apply, with
  nothing changed on disk; a snapshot that passes validation but fails inside
  `replaceWith` (injected) leaves the home tree and the database exactly as
  before; `onModuleInit` against a corrupt file sets `migrationFailure` and
  does not throw.
- Backend unit + e2e green.
