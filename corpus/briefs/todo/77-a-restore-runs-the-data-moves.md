# Brief 77 — A restore runs the data moves

## Context

Brief 75 added `DataMovesService`
(`apps/backend/src/modules/app-data/data-moves.service.ts`), which brief 76
extended. At start (`onApplicationBootstrap`) it copies what the old tables
still hold (`todos`, `bookmarks`, `git_recent_repos`) into each app's data
folder, then drops the tables. If the app has written one of those files
since, it sets the tables aside (`<table>_premove_<yyyymmdd>`) and logs
`app-data.move.set-aside`.

A backup restore (`BackupService` in `apps/backend/src/modules/backup/`)
swaps the home folders and the database in place, with no restart. A backup
made before this release brings the old tables back, and no data files.
Until the next start, Todo and Bookmarks show empty lists. If the owner adds
one todo in that window, the next start sees a file the app wrote and sets
the restored tables aside, so the restored todos are kept but never shown.

## Depends on

- brief 75 (the move), brief 76 (a move per kind, the folder recents).

## Owner decisions (settled 2026-11-09)

1. A restore runs the data moves straight away, after the swap, instead of
   waiting for the next start.

## What to do

1. After a successful restore swap (and only then: not on a rollback), run
   `DataMovesService.run()`. Its failures are logged and never fail the
   restore, the same as at start.
2. Mind the order: the moves must see the restored database and the restored
   home folders, not the pre-restore ones.
3. A restore of a backup made after this release finds no old tables, and
   the moves do nothing, as at start.

## Files you OWN

- `apps/backend/src/modules/backup/` (the restore calling the moves, and its
  module importing what it needs)
- `apps/backend/src/modules/app-data/data-moves.service.ts` only if `run()`
  needs to be callable twice in one process
- their tests, `corpus/`

## Files you must NOT touch

- The moves' own rules (what is copied, set aside or dropped).

## Acceptance

- A test restores a backup holding the old `todos` and `bookmarks` tables
  and no data files. Right after the restore call returns, the apps' files
  exist with the restored rows and the tables are gone, with no restart.
- A restore whose swap fails and rolls back runs no move.
- A restore of a backup with no old tables leaves everything as it was.
- Backend typecheck, the backup and app-data unit tests and their e2e specs
  pass.
