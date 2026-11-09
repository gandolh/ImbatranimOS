# Brief 75 — Todo and Bookmarks install as Accessories

## Context

Todo and Bookmarks leave the image and install together as the Accessories
group. They are the installable organisers for a normal user
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)).
Promoted from the todo `todo-and-bookmarks-install-as-accessories`.

| App | Source / tests | Module today | Hook | System calls |
|---|---|---|---|---|
| Todo | 1,641 / 296 | `todos` (584 lines) | `background` (due dates) | `http`, `notify`, `schedule` |
| Bookmarks | 1,726 / 566 | `bookmarks` (888 lines) | `commandSources` | `fs`, `http`, `intents`, `notify` |

Bookmarks also reads the Browser's config (`/browser/config`); the Browser
stays built in. The steps every move shares are the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

- brief 64, for the group layout;
- brief 69 (`system.data`);
- brief 70 (Bookmarks' import and export by grant);
- brief 71 (the two hooks).

## Owner decisions (settled 2026-11-06)

1. **The group.** The two install together as Accessories (descriptor id
   `accessories`), keeping their ids `todo` and `bookmarks`.
2. **The data** moves once from the `todos` and `bookmarks` modules into JSON
   files in each app's data folder. Todo keeps one file per list. Bookmarks
   keeps one file of groups and links, and its HTML import stays.
3. **The move** happens in the OS backend at the first boot after the
   release that ships this. It writes each table's rows into the app's
   folder, owned by the app and private, and the modules go in the same
   release. A failed write keeps the rows and says so in Logs.
4. **Uninstalling** keeps the data unless "Also remove its data" is ticked.
   Due-date toasts and palette entries stop until the app is back.

## What to do

1. The checklist's steps 1-4 for both apps, in a new Accessories group:
   - Todo declares `background: true` and Bookmarks `commandSources: true`,
     each exported by name;
   - their stores read and write through `system.data` instead of `/todos`
     and `/bookmarks`.
2. The one-time move per decision 3, then delete the `todos` and `bookmarks`
   modules. Due-date toasts keep claiming through `claimScheduleOccurrence`.
3. The walk (checklist step 6):
   - **Before:** a todo due in two minutes, and a bookmark group the palette
     finds.
   - **After the update:** the data is files in the folders; with Accessories
     installed the toast arrives once with two tabs open, and the palette
     finds the bookmark.
   - **After an uninstall:** no toast, no palette entries, and the files stay.
   - **After a reinstall:** both are back.
4. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`,
  `apps/add-ons/todo/` and `apps/add-ons/bookmarks/` (deleted), their
  `manifest.ts` lines, the `todos` and `bookmarks` modules (deleted), the
  one-time move, `package-lock.json`, the corpus pages

## Files you must NOT touch

- The Browser and its module; `schedule`.

## Acceptance

- Tests green in both repos; the walk holds.

## Outcome (2026-11-09)

Built by a subagent on `main`, ready for deploy. Commits: imbatranim-apps
`a8c87f7` (the kit snapshot at OS `98e41ff`, kit 1.6.0; the fake system's
`data`), `1a04603` (the Accessories group) and `ebc2be6` (one id per task);
imbatranimOS `98e41ff` (1.243.0, a command source's `ctx.data`) and
`30a97f6` (1.244.0, the catalog entry pinned to `ebc2be6`, the icons, the
built-ins and both modules gone, the one-time move).

What it does now:
- `marketplace/accessories.json`: Todo (`list-todo`, `notify` and
  `schedule`, `background: true`) and Bookmarks (`bookmark`, `fs`, `http`,
  `intents` and `notify`, `commandSources: true`), ids kept. Todo lost
  `http`: with its module gone it makes no HTTP call. Bookmarks keeps it
  for `/browser/config`.
- Todo's files, in `~/.local/share/imbatranim/todo/`: `lists/<id>.json` per
  list (name, position, tasks) and `unfiled.json`. Bookmarks':
  `bookmarks.json`, every folder flat with `parentId` and its links. Ids,
  positions and timestamps are kept; links are checked for `http(s)` on
  every read as well as every write.
- In the apps, the modules' rules are pure functions (`todoOps.ts`,
  `bookmarkOps.ts`) under a small store (`accessories/shared/src/dataStore.ts`)
  shared by the window and the hooks: a change shows at once, changes take
  turns, each file is written with the version it was read at, and a stale
  write reloads and applies the change again (three tries). The query hooks
  kept their names and shapes, so `Todo.tsx` and `Bookmarks.tsx` are the
  built-ins' code.
- The move (`DataMovesService`, at every start): for each app whose tables
  remain, it writes the files as the app with `AppDataService.place` (the
  OS's write: no installed check, writes only where no file is, leaves one
  holding the same bytes, a 409 for anything else), then drops the tables
  in one transaction. Logs gets `app-data.move.done` with counts, or
  `app-data.move.failed`, the rows kept for the next start.

Choices made here, not owner calls:
- **react-query stays in the desktop.** It isn't one of the lent modules, and
  a bundled copy can't see the desktop's provider, so the apps use the store
  above instead of `useQuery`.
- **A command source gets `ctx.data`** (kit 1.6.0, optional): with no window,
  Bookmarks' palette source has nothing else to read its file through.
- **The tables are dropped after a move**, outside the ledger: a ledger step
  is synchronous and a failure 503s every route, against decision 3. A
  restore of an older backup brings them back; the move then runs at the
  next start (board question 1).
- Bookmarks' reorder routes went with the module: no window ever called them.

Known limits: a move whose file would pass 5 MB (`MAX_DATA_BYTES`) fails and
waits each start, logged; so does one that finds a file the app wrote
since. Todo ids are max + 1, so two tabs adding to different lists at once
can collide; the reader keeps both, renumbering the second.

Walk owed (checklist step 6), in the dev container with a `file://` clone of
imbatranim-apps at `ebc2be6`, `MARKETPLACE_ALLOW_LOCAL_REPOS=true` and a sync
with deletes:
1. Before, on the old image: a todo due in two minutes, a bookmark folder.
2. After the update: the files are in both folders, Logs says moved, Start
   has neither app.
3. Install Accessories: with two tabs open the toast arrives once; the
   palette finds the bookmark.
4. Uninstall: no toast, no palette entry, the files stay. Reinstall: both
   back.

Checks run: OS core and backend typecheck, eslint on changed files; core
vitest for kitHooks, the registry, marketplace, commands, components,
openApp and file grants (450+); backend jest app-data, marketplace, db,
backup and app-identity (518, with 8 new for the move); e2e app-data,
app-identity, file-grants, marketplace-kit, marketplace-suite, security,
app and schedule (68). imbatranim-apps `tsc -b`, eslint, prettier, vitest
across apps and packages (701) and the groups (152, Accessories 122), the
groups build test, `kit:sync --check`, `build:os` for Accessories (Todo 63
kB, Bookmarks 33 kB). Skipped: full suites, the PTY e2e, the browser walk.

Owner steps: push imbatranim-apps first, then this repo, then
`node cli.ts imbatranim-os deploy` from vps-deploy; after the first boot,
check Logs, then install Accessories.
