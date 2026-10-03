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

## Outcome (2026-10-03)

Done, all four steps.
1. **`validateSnapshot`** runs before `swapIn`. It opens the staged snapshot `readonly` and `fileMustExist`, and requires `PRAGMA quick_check` = `ok` and `user_version` ≤ `LEDGER_VERSION`, the new export from `db.service.ts` (7). Anything else is a 400 with nothing moved: "damaged", or "comes from a newer ImbatranimOS".
2. `swapIn` returns `{ restored, undo }`. An `installDatabase` failure runs the undo (a new shared `runUndo`) and then `db.reopen()`, before the `finally` deletes `rollbackAbs`.
3. **`replaceWith`** moves the live file to `<db>.previous`, renames the snapshot in, and opens and migrates it; a `migrationFailure` counts as failure.
   - On failure it removes the new file and, if there was a previous one, puts it back and reopens it.
   - With no previous file, as in a restore, where the live database moved aside with `.imbatranim/`, it leaves the reopen to the caller instead of creating an empty database inside the tree being removed.
4. **`onModuleInit`** catches a failed open or pragma and sets `migrationFailure` to "the database could not be opened: …", so `StorageHealthGuard` answers 503 and the process keeps booting. A new `reopen()` closes and opens `DB_PATH` again.

**Specs:**
- `backup.brief154.spec.ts`, on a real backup made after a todo and with work done since:
  - a snapshot of random bytes is refused at apply, with the home tree file-for-file identical and the todos unchanged;
  - `user_version = 999` is refused as newer;
  - an injected `replaceWith` failure leaves the home tree, the edited `letter.txt`, the todos and the absence of scratch directories exactly as before.
  - On the old code all three failed.
- `db.service.spec.ts`:
  - `onModuleInit` against a non-database file does not throw, and records the failure, so the guard answers 503;
  - `replaceWith` with a non-database file throws, and the previous database is back and queryable with its row;
  - `LEDGER_VERSION` equals a fresh database's `user_version`.
- Backend unit 458/458 and e2e 122/122; eslint is clean across `{src,test}`.
- A flaky brief-80 test surfaced while running them. It is a race in `openBackupStream` that predates this brief, and was fixed in the next commit.
