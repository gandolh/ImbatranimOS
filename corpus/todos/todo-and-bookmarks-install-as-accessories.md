---
title: Todo and Bookmarks install as Accessories
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Todo and Bookmarks install as Accessories

Todo and Bookmarks leave the image and install together as the Accessories group. They bring their hooks (Todo's due-date service, Bookmarks' command-palette source) and keep their data in their own folders instead of the OS database.

Decided in the imbatranim-apps grill on 2026-11-06. It replaces the todo that
also moved Sticky Notes, which stays built in. Grill the open questions below
when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled on 2026-11-06:
- the two install together as the Accessories group (descriptor id
  `accessories`), and Bookmarks stays its own app;
- their data moves once from the `todos` and `bookmarks` modules into real
  files in each app's folder, and the modules are deleted;
- data stays on uninstall unless "Also remove its data" is ticked.

1. **Which file format?** Proposed: JSON. For Todo, one file per list; for
   Bookmarks, one file of groups and links. Bookmarks' HTML import stays.
2. **When does the data move?** Proposed: the OS backend writes each table's
   rows into the app's folder once at boot, after the release that ships
   this, and removes the module in the same release. A failed write keeps
   the rows and says so in Logs.

## Draft brief

### Context

| App | Source / tests | Module today | Hook | System calls |
|---|---|---|---|---|
| Todo | 1,641 / 296 | `todos` (584) | `background` (due dates) | `http`, `notify`, `schedule` |
| Bookmarks | 1,726 / 566 | `bookmarks` (888) | `commandSources` | `fs`, `http`, `intents`, `notify` |

Bookmarks also reads the Browser's config (`/browser/config`), and the
Browser stays built in. Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

- [Games](games-install-from-imbatranim-apps.md), for the group layout;
- [the hooks](catalog-apps-bring-background-services-and-commands.md);
- [the data folder](apps-get-a-data-folder-of-their-own.md).

### What to do

1. The checklist's steps 1-4 for both apps, in a new Accessories group.
   - Todo declares `background: true` and Bookmarks `commandSources: true`,
     each exported by name.
   - Their stores read and write their folder through `system.data`
     instead of `/todos` and `/bookmarks`.
2. The data move per question 2, and the two modules deleted. Due-date
   toasts keep claiming through `claimScheduleOccurrence`.
3. The walk (checklist step 6):
   - the before state is a todo due in two minutes and a bookmark group the
     palette finds;
   - after installing, the toast arrives once with two tabs open, the
     palette finds the bookmark, and the data is files in the folders;
   - after uninstalling, the toast and the palette entries are gone and the
     files stay;
   - after reinstalling, both are back.
4. Corpus (checklist step 7).

### Acceptance

- Tests green in both repos; the walk holds.
