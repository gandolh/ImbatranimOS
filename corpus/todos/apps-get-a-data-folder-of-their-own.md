---
title: Apps get a data folder of their own
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Apps get a data folder of their own

Every app gets a predefined folder for its data, `~/.local/share/imbatranim/<app-id>/`, reached through `system` and scoped to that app, the way Windows has AppData. Todo and Bookmarks move their data there before they become installable, and Git GUI and the REST API Client keep theirs there.

Decided in the imbatranim-apps grill on 2026-11-06
([decisions-marketplace-suites.md](../wiki/decisions-marketplace-suites.md#an-app-keeps-its-data-in-a-folder-of-its-own-2026-11-06)).
Grill the open questions below when the work starts, then promote this to a
numbered brief.

## Open questions (grill before starting)

Settled: real files in a folder per app, at `~/.local/share/imbatranim/<app-id>/`.

1. **The call's shape?** Answered 2026-11-06: yes.
2. **Always present, or a capability an app must list?** Answered 2026-11-06: yes, always present; who may read a file is decided by its owner and mode ([apps-run-as-their-own-identity](apps-run-as-their-own-identity.md)).
3. **What happens to the folder on uninstall?** Answered 2026-11-06: it
   stays. The uninstall prompt (Settings → Marketplace) has an unticked
   "Also remove its data" box, and for a group it covers each app's folder.
   A reinstall finds the data where it was, as Linux keeps `~/.config`.
4. **Do URL apps (the sandboxed ones) get one too?** Answered 2026-11-06: yes, URL apps get one too, through their frame bridge, scoped by their token.

## Draft brief

> Depends on [apps-run-as-their-own-identity](apps-run-as-their-own-identity.md): a data file gets its owner and mode from there. The scoping in step 1 is the minimum either way.

### Context

The decision above. The installable apps that need it: Todo and Bookmarks keep their data in
backend modules today (`todos`, `bookmarks`, rows in the OS database); Git
GUI's recent repos sit in the `git` module's `recents` routes. Clock,
Calendar and Sticky Notes stay built in and keep their modules. The files module already resolves roots (`home`, `notes`) and
guards paths (`apps/backend/src/modules/files/`). The REST API Client keeps a
data file under `~/.config/rest-client/`, through `system.fs`.

### What to do

1. Backend: the per-app folder, created on first write. Every path resolves
   inside it, symlinks out are refused, and the folder's name is the calling
   app's id, never a path the app sends. Versions come from the file's
   modification time and size, or a content hash.
2. Kit: `system.data` per question 1, exported types, and the next kit
   minor. The windowless handle (background services, widgets, layers) has
   it too.
3. Tests: scoping (`../`, symlinks, another app's id), the stale write, two
   writers, and a missing folder.
4. Settings → Marketplace's uninstall prompt gains the "Also remove its
   data" box (question 3).
5. Move the REST API Client's file into its folder, keeping a read of the
   old path once, as the first user, while it is still built in.
6. Corpus: decisions, the research pages, status, log.

### Acceptance

- Tests green.
- The REST API Client's collections survive the move.
- Two tabs saving one collection: the second gets a refusal it can show,
  not a silent overwrite.
