# Brief 69 — Apps get data folders of their own

## Context

Installable apps keep their data as real files in folders of their own, laid
out the XDG way, the way Windows gives a program AppData
([decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#installable-apps-keep-data-in-folders-by-kind),
[decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#an-app-keeps-its-data-in-a-folder-of-its-own-2026-11-06)).
Promoted from the todo `apps-get-a-data-folder-of-their-own`.

Today:
- the REST API Client keeps a file at `~/.config/rest-client/collections.json`
  through `system.fs`;
- Todo and Bookmarks keep rows in the OS database through their backend
  modules, and move in brief 75;
- the files module already resolves roots and guards paths
  (`apps/backend/src/modules/files/`).

## Depends on

Brief 68 (identity and the mode store).

## Owner decisions (settled 2026-11-06)

1. **Four kinds, each under `imbatranim/<app-id>/`:**
   - `~/.config` for settings;
   - `~/.local/share` for data;
   - `~/.local/state` for history and recents;
   - `~/.cache` for anything rebuildable.

   The `imbatranim/` level keeps app ids from clashing with Linux programs'
   folders.
2. **`system.data`** offers `read`, `write`, `list` and `remove` on paths
   inside the app's folder of a kind (default `data`).
   - `read` returns a version, and `write` takes the version it read.
   - A write is refused when the file changed since, so two tabs can't
     silently overwrite each other.
3. **Always present**, like `window`, with no capability to list. Who else may
   read a file is its owner and mode's business (brief 68). New files are
   owned by the app, `rw-------`.
4. **On uninstall** the cache always goes. The rest stays unless the owner
   ticks "Also remove its data" in Settings → Marketplace's uninstall prompt,
   which for a group covers each app. A reinstall finds the data where it was.
   Backups skip the caches.
5. **URL apps get folders too:** through their frame bridge while they are
   sandboxed, scoped by their token, and natively after brief 74.

## What to do

1. **Backend.**
   - The folders are created on first write, for the calling identity only:
     the folder's name comes from the token, never from a path the app sends.
   - Every path resolves inside the folder, and symlinks out are refused.
   - New entries get the app as owner and the private mode in the mode store.
   - Versions come from the file's modification time and size, or a hash.
2. **Kit:** `system.data` per decisions 2 and 3, on the windowless handle too
   (background services, widgets, layers), with its types exported and the
   next kit minor.
3. **Sandbox bridge:** the URL-app frame's runtime forwards `system.data`
   calls under its token.
4. **Uninstall:** the prompt gains the box; removing deletes the app's folders
   of all four kinds. The cache always goes.
5. **Backups** leave out `~/.cache/imbatranim/`.
6. **First user:** the REST API Client moves its collections into
   `system.data` (data kind), reads the old `~/.config/rest-client/` file
   once, then removes it. It is still built in here.
7. **Tests:**
   - scoping: `../`, symlinks, and another app's id;
   - kinds;
   - the stale write, and two writers;
   - uninstall with and without the box;
   - backups skipping caches;
   - the bridge.
8. **Corpus:** decisions (what was built), status, log.

## Files you OWN

- a backend data module and its tests, the kit's `system.data` and types,
  the sandbox runtime's forwarding, the Marketplace uninstall prompt, the
  backup's exclusion list, the REST API Client's collections store

## Files you must NOT touch

- `system.fs` (brief 70), Todo and Bookmarks (brief 75).

## Acceptance

- Tests green. The REST API Client's collections survive the move.
- With two tabs saving one collection, the second gets a refusal it can show.

## Progress (2026-11-08)

The review's last three fixes landed in `ee04778` (1.220.0):
- Uninstall revokes the app-identity token and the file grants of every app
  of the row (it had revoked only the URL sandbox's tokens).
- The token route refuses a catalog app no installed descriptor holds: a
  built-in is told apart only by no descriptor holding it, so an uninstalled
  catalog app's open window could take a new token and be given `system`.
- One lock per app folder: writes and removals take their turn on the
  folder, the key an uninstall's removal uses, and refuse an app that is
  gone. `InstalledApps` marks a row's apps as leaving for the whole
  uninstall, so a write that waited behind the removal puts nothing back.
`recordedBuild` moved to `marketplace/recorded-build.ts` to break the module
cycle the data service's new dependency made. Tests: backend 1092 unit;
e2e for app data, identity, grants and the four marketplace suites, 88.

Still open: the walk, which was stopped before it finished on 2026-11-06.
A URL app has the hole the catalog check closes, once uninstalled: the todo
`uninstalled-url-apps-read-as-built-ins`.

## Outcome (2026-11-09)

Ready for deploy. Installable apps keep data in folders of their own by
kind through `system.data`, with versions between tabs; uninstall keeps the
data unless the box is ticked, and caches always go; backups skip caches;
the REST API Client's collections moved into its data folder. Commits:
`f31da1c`, the review fixes `f1abb2c`, `3e357e8`, `9069d08` and
`ee04778`, and `760e671` (an app from a URL that isn't installed gets no
identity, which closed the gap this brief's review left).

Walked: no walk of its own finished. Brief 70's dev-container walk
(2026-11-09, 15 steps, then 5) used the data folders in passing (the REST
API Client's saved requests and its notice about the earlier doc) and
walked Office and files thoroughly. Not walked: uninstall with and without
"Also remove its data", two tabs saving one collection, backups skipping
caches, and the URL-app bridge; the unit and e2e tests cover them.

Owner steps: push imbatranim-apps first, then imbatranimOS, then `node
cli.ts imbatranim-os deploy` from vps-deploy.
