---
title: Installable apps get files by grant
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# Installable apps get files by grant

An installable app sees its own folders and, beyond them, only the files and folders the owner gives it: one opened with it through the OS (Files, Start's recents, Open With) or picked in the OS's pickers. The grant lasts for that window. Built-in apps keep full access to home, as Android's scoped storage, Flatpak's portals and the macOS sandbox do for the system's own apps.

Decided in the imbatranim-apps grill on 2026-11-06
([decisions-app-identity-and-trust.md](../wiki/decisions-app-identity-and-trust.md#installable-apps-see-other-files-only-by-grant)).
Grill the open questions below when the work starts, then promote this to a
numbered brief.


> PROMOTED 2026-11-06 to [brief 70](../briefs/todo/70-installable-apps-get-files-by-grant.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

Settled on 2026-11-06:
- installable apps see their own folders and granted files only; built-ins
  keep full home access;
- a grant comes from an OS-made open or a pick, and lasts for the window;
- the REST API Client's typed paths become a picker.

1. **Does a recent file keep its grant?** Answered 2026-11-06 (as proposed): no lasting grant. Opening
   it again from Start's recents or the app's own recents goes through the
   OS, which grants it again.
2. **Read-only or read-write?** Answered 2026-11-06 (as proposed): as opened. Open With and Open give
   read-write, since the app saves back to it, and Save As grants the picked
   path.
3. **Folders?** Answered 2026-11-06 (as proposed): `pickDirectory` grants the folder and everything
   under it, for that window.

## Draft brief

### Context

- `system.fs` reads and writes anywhere in home for any app that lists `fs`.
- The pickers (`pickOpen`, `pickSave`, `pickDirectory` in
  `packages/ui/src/system.ts`) are already the portal.
- Office's apps read the file they were opened with (`readWithVersion`),
  save back with `upload`, and use the pickers for Open and Save As.
- The REST API Client reads a typed path
  (`system.fs.read('home', filePath)`). Bookmarks reads and uploads for
  import and export.

### Depends on

[apps-run-as-their-own-identity](apps-run-as-their-own-identity.md) (the
backend knows which app and instance is calling).

### What to do

1. A grant table per instance: what an OS-made open or a pick gave it.
   `system.fs` refuses an installable app anything outside its folders and
   its grants, naming the path.
2. Intents from Files, Start's recents and Open With grant the file to the
   instance they open; the pickers grant what was picked.
3. The REST API Client's attach-a-file and Bookmarks' import and export use
   the pickers.
4. Tests:
   - an installable app is refused an ungranted path;
   - it may read and save a file it was opened with;
   - it gets a picked folder's children;
   - a built-in still reads anywhere.
5. A walk with Office installed:
   - open, edit and save a `.docx` from Files;
   - Save As to a new folder;
   - reopen from recents.

### Acceptance

- Tests green; Office's walk unchanged for the owner.
