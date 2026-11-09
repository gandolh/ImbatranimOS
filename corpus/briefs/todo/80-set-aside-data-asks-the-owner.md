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
