# Brief 70 — Installable apps get files by grant

## Context

An installable app sees its own folders and, beyond them, only files the
owner gives it. That is the rule of Android's scoped storage, Flatpak's
document portal and the macOS sandbox
([decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#installable-apps-see-other-files-only-by-grant)).
Promoted from the todo `installable-apps-get-files-by-grant`.

Today `system.fs` reads and writes anywhere in home for any app that lists
`fs`. The pickers (`pickOpen`, `pickSave`, `pickDirectory` in
`packages/ui/src/system.ts`) are already the portal (2026-08-06).

How the installable apps use files:
- Office's apps read the file they were opened with (`readWithVersion`),
  save back with `upload`, and use the pickers for Open and Save As.
- The REST API Client reads a typed path (`system.fs.read('home',
  filePath)`).
- Bookmarks reads and uploads for import and export.

## Depends on

Brief 68 (the backend knows which app and instance is calling).

## Owner decisions (settled 2026-11-06)

1. **Who is scoped.** Installable apps see their own folders plus granted
   files and folders only. ~~Built-in apps keep full access to home.~~
   **Revisited later on 2026-11-06, after brief 68 was built:** built-in
   apps are scoped too. The owner chose the stricter default over brief
   68's: a path with no mode row is the user's with folders `rwx--x--x` and
   files `rw-------`, so group `system` (the built-ins) no longer has
   blanket access; each built-in reaches only what it opens through Files,
   Start's recents, Open With or a picker, plus its own data folder (brief
   69). Settings, Files and the Terminal still act as the user
   (`ACTS_AS_USER`, brief 68), since they are the file manager and the
   shell. **This brief flips the default** (in brief 68's `ModeStore`
   defaults, `modes.ts`) together with the grant flows, so no built-in loses
   access before it can be granted. List every built-in's file flows (open,
   save, save as, recents, open folder, a Git repo, a media folder, Paint's
   images, the Code Editor's folder tree) and give each a grant path; a
   built-in that needs a whole folder (the Code Editor, Git GUI, Media
   Player's playlist) gets a folder grant from an OS folder picker.
2. **What makes a grant.** An OS-made open (Files, Start's recents, Open With)
   or a pick. It lasts for that window.
3. **No lasting grants.** Reopening a recent file goes through the OS, which
   grants it again.
4. **Grants match how the file was given.** An opened file is read-write,
   since the app saves back to it. Save As grants the picked path, and a
   picked folder grants everything under it for that window.
5. **Typed paths go.** The REST API Client attaches files through
   `pickOpen`.
6. **An opened file's folder (2026-11-09).** An OS-made open (Files, Open
   With, the launchers, a pick core hands the app) also gives read on the
   opened file's folder, listing included, but only to apps that declare it
   in their manifest: Media Player, Image Viewer and Notepad do. Apps that
   don't declare it get the file alone. An app-made open never gets the
   folder; it gives only what the app holds. Read on the folder is taken
   literally: listing the folder and reading the files directly in it, not
   what is in its subfolders (a file at the top of home would otherwise give
   all of home).

## What to do

1. **The grant table:** per instance, what an OS-made open or a pick gave it,
   dropped when the instance closes. For an installable app's identity,
   `system.fs` refuses anything outside its folders and its grants, naming
   the path. Brief 68's modes still apply inside.
2. **Granting:** intents from Files, Start's recents and Open With grant the
   file to the instance they open, and the pickers grant what was picked.
   An app's own recents list (Office records them with `recordRecent`)
   reopens through `system.intents`, so the OS makes the open and grants it;
   check each Office app does.
3. **Pickers instead of paths:** the REST API Client's attach-a-file uses
   `pickOpen`. Bookmarks already uses the pickers for import and export;
   check it does.
4. **Tests:**
   - an installable app is refused an ungranted path;
   - it may read and save a file it was opened with;
   - Save As writes the picked path;
   - a picked folder's children are readable;
   - grants die with the window;
   - a built-in still reads anywhere.
5. **Walk** with Office installed:
   - open, edit and save a `.docx` from Files;
   - Save As into a new folder;
   - reopen it from Start's recents;
   - a second Office window can't read the first one's file until it is
     given it.
6. **Corpus:** decisions (what was built), status, log.

## Files you OWN

- the backend's `system.fs` routes' identity checks and the grant table,
  the intent and picker paths that grant, the REST API Client's file
  attachment, and their tests

## Files you must NOT touch

- Built-in apps' file access, beyond the REST API Client's attachment.

## Acceptance

- Tests green.
- Office's walk is unchanged for the owner, apart from the refusal the
  walk's last step expects.

## Progress (2026-11-06)

First half built: `98958a2` (grant table, checks, core granting on
`openApp` and the pickers; built-ins not flipped) and `708c042` (the REST
API Client picks its files). See `log.md`.

**A gap to close first.** `system.intents.openApp` from an app makes core
grant the payload's file as the user, so an app can grant itself any path by
opening itself with it (and core records the recent as the user too). Fix:
`openApp` takes the requesting copy's client; an app-made open grants (and
records the recent) with the app's token, so the backend allows only what
the app holds, plus a file in that app's own recent files when the target is
the same app (`RecentService` lookup in `GrantsController`'s hand-on
branch). Core's launchers and Files keep granting as the user. Tests: an app
can't open itself with a file it doesn't hold; it reopens its own recent in
a new window; another app can't use those recents.

**The gap is closed (2026-11-09, `26a4f85`).** An app's
`system.intents.openApp` passes its copy's client to `openApp`, which grants
and records the recent with the app's token. `GrantsController`'s hand-on
branch also lets an app give a window of its own a file among its own recent
files (`RecentService.isRecentOf`); folders never qualify. `RecentController`
lets an app record one of its own recents again without holding it (the
reopen in a new window moves it up). One app opening another records no
recent for it. Launchers, Start, Files and the pickers still grant as the
user. Grant calls are now sent before they join the target's pending set, so
an app opening its own window doesn't wait on its own grant. Two more for
the second half: a notification action's `{ root, openPath }` payload is the
app's, yet `ToastHost` opens it as the user, so the owner's click gives the
app that file; and recents recorded under a retired built-in's id aren't the
suite app's own on the backend (see `log.md`, 2026-11-09).

**Built-ins' file flows** (inventory 2026-11-06; fine today, break at the
flip). Each needs a grant path or an owner call before `modes.ts` flips:
- *Listing the opened file's folder* (a file grant never lists): Media
  Player's queue, siblings and subtitles (`api/listDir.ts`,
  `TrackStage.tsx`); Image Viewer's prev/next (`ImageViewer.tsx`);
  Notepad's 1 MiB size guard (`Notepad.tsx`, swallowed), image attach and
  the Markdown preview's relative images and links (`NoteEditor.tsx`,
  `MarkdownPreview.tsx`). **Owner call:** does an OS-made open also give
  read on the file's folder (all apps, or apps that declare it), or do these
  degrade to one file?
- *A persisted path re-read in a new window*: the Code Editor's tab session
  (`lib/tabSession.ts`), Git GUI's recent repos (`/git/recents`), the REST
  client's saved requests with a file, Notepad's "open in new window" (the
  new window gets no grant). Reopen through the app's own recents (the gap
  fix above), or a hand-on from the old window.
- *A folder grant needed*: Git GUI's typed path (drop it for Browse, as the
  REST client did); the Code Editor's find-in-files without a scope (it
  works after "Search in folder").
- *Intent payloads that aren't `{ root, openPath }`*: the Diff tool's
  `{ leftRoot, leftPath, rightRoot, rightPath }` (Files' Compare) and Git
  GUI's `{ leftText, rightRoot, rightPath }`; `openApp` must grant each file.
- *Fixed places*: the Snipping Tool saves to `Pictures/Screenshots`; the REST
  client's old `~/.config/rest-client` doc (403 already reads as missing;
  add the notice).
- *The `notes` root*: nothing special-cases it; Notepad's startup probe
  falls back to home quietly, and Git GUI offers it as a typed root.
- No flow drags files from Files into an app. Paint, Bookmarks, Calendar and
  the Snipping Tool's open go through pickers or intents and are fine.

**Second half built (2026-11-09).** `b9bd180` (decision 6: `readsOpenedFolder`
in the manifest, a `listing` grant, ledger 15; Notepad's image attach goes
through the Save dialog), `60c8b81` (each built-in's flows: `fs.reopenRecent`
for the Code Editor's restored tabs and Git GUI's recent repos, git recents
per app in ledger 16, Git GUI's typed path gone, comparison payloads granted
per file, find in files asks for its folder, Notepad's new file and the
Snipping Tool's save go through the Save dialog, the REST client asks for a
saved request's file again and offers to bring in its earlier doc),
`aab1698` (a notification action's file gives nothing) and `8b10be0` (the
flip in `modes.ts`, and a `read` grant kind so a link followed from a Notepad
document opens the file beside it read-only). The walk is still owed.

Changes the owner can veto: the Snipping Tool's save and Notepad's image
attach now show the Save dialog every time, and find in files has no
"everywhere".

Left open:
- Recents recorded under a retired built-in's id (`docs`, `sheets`,
  `slides`, `norpdf`, `pdf-viewer`) aren't the suite app's own on the
  backend, so the suite app can't reopen them in a new window or see them in
  its own list; Start still opens them, as the user. Fixing it means
  rewriting the rows under the new ids, which needs `RETIRED_APP_IDS` on the
  backend too.
- One app opening another with a file records no recent for the target; the
  target records its own (Notepad, the Diff tool and Office do).
- Code Editor tabs opened from find in files aren't recents, so after a
  reload they don't restore.
- An installable app can't declare `readsOpenedFolder` yet: the
  descriptor schema doesn't carry it.
- The `notes` root: Notepad's probe for old notes is refused and falls back
  to home quietly; the picker still shows Notes.
