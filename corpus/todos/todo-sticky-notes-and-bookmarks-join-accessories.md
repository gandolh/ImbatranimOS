---
title: Todo, Sticky Notes and Bookmarks join Accessories
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Todo, Sticky Notes and Bookmarks join Accessories

Todo, Sticky Notes and Bookmarks join Accessories, each bringing one hook: Todo's due-date service, Sticky Notes' desktop layer, Bookmarks' palette source. Their data stays where it is.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); the three go to Accessories, and Bookmarks stays its own app rather than folding into the Browser.

1. **Do their backend modules (`todos`, `sticky-notes`, `bookmarks`) stay in the OS, with only the apps moving?** Proposed: yes (Claude's default of 2026-11-06). Nothing is migrated, and the data survives an uninstall and comes back on reinstall. The alternatives: a per-app store in the OS (a migration), files in the home folder (a migration, and two tabs writing one file), or a server in the group (about 100 MB while it runs and a cold start, on the 1 GiB box).
2. **Do sticky notes leave the desktop on uninstall and come back with the app?** Proposed: yes; they are data in the module, so nothing is lost.

## Draft brief

### Context

Three more of the apps
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked, each by one hook:

| App | Source / tests | Backend module | Hook | System calls |
|---|---|---|---|---|
| Todo | 1,641 / 296 | `todos` (584) | `background` (due dates) | `http`, `notify`, `schedule` |
| Sticky Notes | 1,103 / 137 | `sticky-notes` (326) | `desktopLayer` (the notes on the desktop) | `http`, `notify` |
| Bookmarks | 1,726 / 566 | `bookmarks` (888) | `commandSources` (the palette) | `fs`, `http`, `intents`, `notify` |

Bookmarks also reads the Browser's config (`/browser/config`). The Browser
stays in the base. The owner approved moving all three on 2026-11-06 ("looks
good, write the briefs"), and kept Bookmarks as its own app rather than
folding it into the Browser.

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[The hooks](catalog-apps-bring-background-widgets-layers-and-commands.md) and [Calculator, Paint and Snipping Tool](calculator-paint-and-snipping-tool-install-as-accessories.md)
(the Accessories group).

### What to do

1. The checklist's steps 1-4 for the three apps, added to
   `accessories.json` with a new pin:
   - Todo declares `background: true`;
   - Sticky Notes declares `desktopLayer: true`;
   - Bookmarks declares `commandSources: true`;
   - each exports its hook by name (the hooks todo).
2. The walk (checklist step 6):
   - the before state is a todo due in two minutes, three sticky notes on
     the desktop, and a bookmark group that the palette finds;
   - after removing them, nothing fires, no notes are on the desktop, and
     the palette shows no bookmarks;
   - after installing Accessories, the due toast arrives once with two tabs
     open, the notes are back where they were, and the palette finds the
     bookmark;
   - after uninstalling and reinstalling, the data is still there.
3. Corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: the three apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, the three
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- `apps/backend/src/modules/todos/`, `sticky-notes/`, `bookmarks/` and
  `browser/`, per question 1.
- The Browser add-on.

### Acceptance

- Tests green in both repos; the walk holds, the data survival included.
