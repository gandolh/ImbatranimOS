# Brief 76 — Git GUI and the REST API Client install as Developer

## Context

Two developer tools leave the image and install together as the Developer
group. The OS keeps the work that needs the server as its own services: the
`git` module runs git on repos in home, and `http-proxy` sends a request
behind the SSRF guard. The apps are the features and UI on top
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)).
The Code Editor stays built in. Promoted from the todo
`git-gui-and-rest-api-client-join-developer`.

| App | Source / tests | Leans on | System calls |
|---|---|---|---|
| Git GUI | 1,947 / 326 | `git` (2,768 lines), its `recents` routes | `http`, `intents`, `notify` |
| REST API Client | 2,946 / 1,115 | `http-proxy` (783 lines) | `fs`, `http`, `intents`, `notify` |

After brief 69 the REST API Client's collections are already in its data
folder, and after brief 70 it attaches files by picker. The steps every move
shares are the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

- brief 64 (the group layout);
- brief 69 (data folders);
- brief 70 (grants).

## Owner decisions (settled 2026-11-06)

1. **The group.** The two install as Developer (descriptor id `developer`),
   keeping their ids.
2. **`git` and `http-proxy` stay in the OS**, trimmed to the work that needs
   the server. Whatever in them serves only the app moves to the app: Git
   GUI's recent repos leave the `git` module's `recents` routes for its
   state folder (`system.data`, kind `state`), moved once.
3. **Uninstalling** keeps the data unless "Also remove its data" is ticked.

## Owner decision (2026-11-09, revises decision 2)

4. **The OS recents decide what reopens.** Since brief 70, a new Git GUI
   window gets a recent repository back only because the grants hand-on
   finds it in the `git` module's table; the app's own state file can't
   take that over, since an app may write anything into it. So Git GUI
   records each repository it opens with `system.fs.recordRecent` (the
   backend checks it holds the folder), the hand-on gives back a folder
   among the app's own recents, and the move copies Git GUI's rows both into
   its state file (the list it shows) and into `recent_files`, then drops
   `git_recent_repos`. Accepted cost: repository folders show in Start's
   Recent, the picker's Recent tab and the palette as Git GUI's, and count
   toward the 50-entry limit. Rejected: a new OS record of every folder
   given to an app (it would widen what an app gets back, with no forget),
   and a display-only list whose click opens the folder chooser again.

## What to do

1. The checklist's steps 1-4 for both apps, in a new Developer group.
2. Git GUI's recents move per decision 2: a one-time copy at the first boot
   after the release, then the `recents` routes go from the `git` module.
3. Check nothing outside the two apps opens them (Files, the Code Editor, the
   palette). If something does, apply checklist step 5.
4. The walk (checklist step 6):
   - **Before:** a repo in home with a staged change, a saved REST request
     with an environment variable, and Git GUI's recents.
   - **After installing Developer:** commit and send the request; the recents,
     the saved request and the environment are back.
   - **Uninstall, then reinstall:** they are still there.
5. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the Developer group
- in this repo: `marketplace/developer.json`, `ICONS`,
  `apps/add-ons/git-gui/` and `apps/add-ons/rest-api-client/` (deleted),
  their `manifest.ts` lines, the `git` module's `recents` routes (removed),
  `package-lock.json`, the corpus pages

## Files you must NOT touch

- The rest of the `git` module, and `http-proxy`.

## Acceptance

- Tests green in both repos; the walk holds.

## Outcome (2026-11-09)

Built by a subagent on `main`, ready for deploy. Commits: imbatranim-apps
`8a1e811` (the data store moves to `packages/shared/src`, with `inFolder`)
and `4ef5f5a` (the Developer group); imbatranimOS `8231ee8` (1.254.0: the
catalog entry pinned to `4ef5f5a`, the icons, both built-ins gone, folder
recents, the `recents` routes gone, the one-time move).

What it does now:
- `marketplace/developer.json`: Git (`git-gui`, icon `git-branch`) and REST
  Client (`rest-api-client`, icon `send`), names, sizes and single window as
  the manifests had them, ids kept. Both ask for `fs`, `http`, `intents` and
  `notify`: Git GUI gained `fs` (the folder chooser and its recents) and
  still calls the `git` routes over `http`. Built sizes: Git 60 kB, REST
  Client 80 kB.
- The `git` module runs git and nothing else: its `recents` routes, the
  service's list and its database dependency are gone. `http-proxy` is
  untouched.
- **Folder recents** (decision 4). `recent_files` has a `kind` (ledger 18,
  rows from before are files). An app records a folder only when it may
  list and write in it (a picked folder, or one it was given back); a
  folder it may only list (a `listing`) is refused. The OS opening a folder
  with an app records it as that app's. The hand-on gives a window of the
  app's own a folder among its own recents; a file recent gives a file only.
  Start and the palette open a folder recent in its app, which opens the
  repository from the open intent; the file picker's Recent tab leaves
  folders out (picking one as a file means nothing).
- **Git GUI's list** is `recents.json` in its state folder
  (`~/.local/state/imbatranim/git-gui/`), newest first, ten at most, kept
  through the shared store. Opening a repository records the OS recent and
  moves it to the top. Forget takes it off the list and off the OS recents.
  A recent the OS refuses (403, its recents were cleared) or that is gone
  (404) comes off the list on the click; the repository screen shows the
  error.
- **The move** (`DataMovesService`, at every start while the table is
  there): Git GUI's rows only (`app_id = 'git-gui'`; a row the user
  recorded had no app to go to) are written as the app into
  `recents.json` with `AppDataService.place` (kind `state`; `Move` now names
  its kind), and in the transaction that drops `git_recent_repos` each
  becomes one of Git GUI's OS recents, a folder, writable, with its
  `last_opened`. A path already among the recents keeps its row. Logs gets
  `app-data.move.done` with the count.
- The REST API Client moved as it was: its collections were already in its
  data folder (`collections.json`) with the notice and "Bring them in…" for
  the old `~/.config/rest-client` doc.
- Nothing else opens either app: no file type, no Files or Code Editor
  path. The palette now leaves out every recent whose app is gone or turned
  off, as Start already did, so a repository with Developer uninstalled
  (or an Office file with Office uninstalled) no longer shows an entry that
  opens nothing.

Choices made here, not owner calls: the picker leaving folders out; Forget
also dropping the OS recent; a refused or missing recent coming off the
list on the click; the palette's filter; Git GUI reading its open intent;
the store's `inFolder` for a store kept in `state`. The two test files
`git.brief76.spec.ts` and `git.brief76.real.spec.ts` carry a brief number
from before the 2026-11-02 reset in their names; renaming them was out of
scope.

Known limits: the repositories share the 50-entry prune with every recent
file, so a busy week of files can push them out (the list still shows them;
a click then takes them off). Start's "Clear recent files" clears them too.
Uninstalling with "Also remove its data" removes `recents.json` but not the
OS recents, so Start still lists the repositories once Developer is back.

Walk owed (checklist step 6), in the dev container with a `file://` clone of
imbatranim-apps at `4ef5f5a`, `MARKETPLACE_ALLOW_LOCAL_REPOS=true` and a sync
with deletes:
1. Before, on the old image: a repo in home with a staged change opened in
   Git GUI (so it is a recent), a saved REST request using `{{base}}` from
   an environment.
2. After the update: Logs says Git GUI's data moved;
   `~/.local/state/imbatranim/git-gui/recents.json` lists the repo; Start
   has neither app, and its Recent shows no repo while Developer is out.
3. Install Developer (note time and size): Git's open screen lists the
   repo; a click opens it in a fresh window and the commit goes through;
   Start's Recent shows the repo under Git's icon and opens it in Git; the
   picker's Recent tab doesn't show it. The REST Client shows the saved
   request and the environment, and sends it.
4. Uninstall, then reinstall: the recents, the request and the environment
   are back. After Start's "Clear recent files", a click on the Git recent
   takes it off the list.

Checks run: OS backend typecheck; jest app-data, files, app-identity, git,
db, backup and marketplace (638); e2e file-grants, app-data, files,
app-identity and marketplace* (123); core `tsc -b`, eslint and prettier on
changed files, vitest for commands, registry, files components, intents,
marketplace and lib (385). imbatranim-apps `tsc -b`, eslint, prettier,
vitest for Developer, Accessories and the store (303), the groups build
test with Developer (24 with the kit snapshot test), `kit:sync --check`
(kit unchanged at `1b744e4`), `build:os` for Developer and Accessories.
Skipped: full suites, the PTY e2e and the browser walk; Office's tests (the
kit didn't move).

Owner steps: push imbatranim-apps first, then this repo, then
`node cli.ts imbatranim-os deploy` from vps-deploy; after the first boot,
check Logs for Git GUI's move, then install Developer.
