# Brief 80 — Set-aside data asks the owner

## Context

`DataMovesService` (`apps/backend/src/modules/app-data/data-moves.service.ts`)
sets old tables aside when an app has written its files since: it renames
them `<table>_premove_<yyyymmdd>` (a number added if taken), keeps them,
never reads them again, and logs `app-data.move.set-aside`. Today only the
Logs line says they exist. On 2026-11-09 the owner asked for a prompt that
lets them download that data or clean it out. It covers every move that
can set tables aside: Todo, Bookmarks and Git GUI's recent repos.

## Depends on

- brief 75 and 76 (the moves and the set-aside).

## Owner decisions (settled 2026-11-09)

1. An OS notice at sign-in: "Incompatible older data was found for Todo and
   Bookmarks." (naming the apps that have set-aside tables), with two
   choices.
2. **Download** saves one `.zip` through the Save dialog. It holds the data
   in the apps' own JSON, laid out like the data folders
   (`todo/lists/<id>.json`, `todo/unfiled.json`,
   `bookmarks/bookmarks.json`, `git-gui/recents.json`), so restoring it by
   hand means unzipping into place. After the download, the notice offers
   the clean-out.
3. **Clean out** deletes the set-aside tables after a confirmation.
4. The notice comes back at every sign-in until the owner picks one.

Settled before the build (2026-11-09; the owner's rule: follow well-known
Unix-then-Windows conventions, technical calls are the controller's). These
replace the parts of 2 and 4 they name:

5. The download is a `.tar.gz` (like the OS's own backups; it keeps modes),
   default name `imbatranim-old-data-<yyyy-mm-dd>.tar.gz`, replacing the
   `.zip` in decision 2.
6. Several set-aside sets get one top-level folder each, named by ISO date;
   a second set on the same day is numbered like logrotate:
   `2026-11-09/todo/lists/3.json`, `2026-11-09.1/...`. Nothing merged or
   dropped.
7. A download counts as the owner's pick (decision 4): the backend records
   it and the sign-in notice stops. While set-aside tables remain, Settings
   keeps a "Clean out older data" entry, so the clean-out stays reachable.

## What to do

1. Backend routes, user session only (never an app token): list the
   set-aside tables per app; build the zip from them, writing each file
   the way the move would have; drop them. Reuse the code that turns rows
   into files rather than a second copy of it, and the archive module for
   the zip if it fits.
2. The notice in the desktop at sign-in when the list isn't empty, with the
   two actions. Download goes through the OS's Save dialog. Clean out asks
   once more ("This deletes the older data for good") before dropping.
3. A Logs line for a download and for a clean-out.

## Files you OWN

- `apps/backend/src/modules/app-data/` (the routes and the zip), the
  desktop's sign-in notice in `apps/core/src/`
- their tests, `corpus/`

## Files you must NOT touch

- The moves' own rules (when they set aside, what they copy).

## Acceptance

- e2e: with set-aside tables for Todo and Bookmarks, the list names both;
  the zip holds the files in the apps' format with the rows' ids,
  positions and timestamps; clean-out drops exactly the `_premove_` tables
  and the list is then empty; an app token gets 403 on every route.
- Core tests: the notice shows only when the list isn't empty; Download
  then offers the clean-out; Clean out confirms first; the notice comes
  back on the next sign-in until one is done.
- Backend and core typecheck and the app-data specs pass.

## Outcome (2026-11-09)

Built on `main` in `7e79924` (1.275.0), ready for deploy.

What it does now:
- `/api/system/old-data` (`SetAsideController`, `UserOnlyGuard`: an app token
  gets 403 `USER_ONLY`): `GET` → `{ apps, sets, notice }`; `POST download
  { root, path }` → `{ path, files }`, 404 when nothing is set aside;
  `DELETE` → `{ dropped }`.
- `SetAsideService` finds the tables in `sqlite_master` with
  `^(todos|todo_lists|bookmark_links|bookmark_groups|git_recent_repos)_premove_\d{8}(_\d+)?$`
  (`SET_ASIDE_TABLE`); no request input reaches SQL. A set is one move's
  tables with the same day and number; a table whose partner has another
  number is a set of its own. Per app, a day's sets are numbered by
  position: `2026-11-09`, `2026-11-09.1`.
- The readers are the moves' own: each move's `files()` takes a
  `TableSource` (live name → the table to read), so
  `DataMovesService.filesFrom(appId, from)` gives the archive the same JSON
  (Git GUI's: folders gone dropped, capped at 10; its `keep()` is not run).
  The live moves pass their own names; `data-moves.service.spec.ts` passes
  unchanged. `DataMovesService.queued()` runs the list, the download and the
  clean-out on the moves' promise chain.
- The archive: the files staged in a temp folder (0600, folders 0700), packed
  with the `tar` binary as backups are (named top folders, so no `./`
  prefix), then written with `FilesService.uploadFile(root, path, tmp)` as
  the user: the jail, the atomic rename. `archive.service.ts` was not used or
  touched.
- The pick is recorded in the home's `.imbatranim/set-aside-downloads.json`
  (the downloaded table names; backups carry it with the database), so a
  table set aside later asks again. The clean-out drops the tables in one
  transaction and removes the file. Logs: `app-data.set-aside.downloaded`,
  `app-data.set-aside.cleaned`.
- Core: `checkOldDataAtSignIn()` runs after the dotfiles are read in
  `AuthGate`, never holding the desktop; `OldDataNoticeHost` (mounted beside
  the file portal) asks "Incompatible older data was found for Todo and
  Bookmarks." with Later, Clean out… and Download…. Download goes through
  the Save dialog (`requestPick`), then says where it saved and offers the
  clean-out. The notice steps aside while the Save dialog or the
  confirmation is up. Settings, under **Storage** (it is about what's on
  disk), shows Download… and "Clean out older data" while any set is left.

Choices made here, not owner calls: the record lives in a file, not a new
ledger step (no schema bump); Settings also offers the download again; a set
with links but no folders writes nothing, as the move would.

Known limit: pairing is by day and number only. If a move once set aside
just one of its tables and later both on the same day, the first set's table
and the second set's partner can share a number and be paired.

Walk owed, after the deploy: make a set-aside table (restore a backup from
before the moves, add a todo, restart; or create `todos_premove_<day>` by
hand), then sign in: the notice names Todo; Later, sign in again, it asks
again; Download… suggests `imbatranim-old-data-<today>.tar.gz`, then offers
Clean out…, and Logs has the line; the archive opens in Files as
`<day>/todo/...`; sign in again: no notice, Settings → Storage keeps the
entry; Clean out confirms, then the entry goes.

Checks run: backend `tsc`, core `tsc -b`, eslint and prettier on changed
files; backend jest app-data and backup (107, the moves spec unchanged); e2e
app-data and app-data-set-aside (15, 7 new); core vitest for the notice and
the Settings entry (7 new), settings, auth, retiredApps, prefs. Skipped: full
suites and the browser walk.

Owner steps: push imbatranimOS (imbatranim-apps has nothing unpushed), then
`node cli.ts imbatranim-os deploy` from vps-deploy; then the walk.
