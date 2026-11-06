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
   files and folders only. Built-in apps keep full access to home.
2. **What makes a grant.** An OS-made open (Files, Start's recents, Open With)
   or a pick. It lasts for that window.
3. **No lasting grants.** Reopening a recent file goes through the OS, which
   grants it again.
4. **Grants match how the file was given.** An opened file is read-write,
   since the app saves back to it. Save As grants the picked path, and a
   picked folder grants everything under it for that window.
5. **Typed paths go.** The REST API Client attaches files through
   `pickOpen`.

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
