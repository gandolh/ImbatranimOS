> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [start-shows-a-folder-per-group](../../todos/start-shows-a-folder-per-group.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 55 — Start shows a folder per group

## Context

Start's app list is flat, in registry order
(`apps/core/src/shared/components/taskbar/StartMenu.tsx`). With Office's five
apps, Hollow and Linux apps beside the built-ins, it already passes 30
entries, and every install group adds more.
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#2-install-groups-and-start-folders)
proposed one Start folder per install group, like Windows 7's "All
Programs". This fits the locked Win7-classic layout. The owner approved it on
2026-11-06 ("looks good, write the briefs").

Office is a group already, so this brief can run before brief 51.

## Owner decisions

Approved 2026-11-06: a folder per group. The smaller calls, with the default
this brief builds:

1. **What makes a folder.**
   - A v2 descriptor (a suite) is a folder named by its `name` ("Office",
     later "Games", "Accessories", "Developer").
   - A v1 descriptor gains an optional `folder` with the name of the folder
     it joins. Hollow says "Games".
   - Built-ins and URL apps stay at the top level.
   - Linux apps get one folder, "Linux apps".

   Default: yes.
2. **How a folder opens.** It expands in place, inside Start's list, with a
   chevron, and remembers being open for the session. A cascading submenu
   would be harder on the phone. Default: in place.
3. **Search.** Typing in Start still searches every app, inside folders too.
   Default: yes.

## What to do

1. Catalog: add an optional `folder` to v1 descriptors (a name, up to 40
   characters), passed through the listing. Give `marketplace/hollow.json`
   `"folder": "Games"`.
2. Start: group the enabled apps as in decision 1, with folders after the
   top-level apps, both in the current order. Folders behave as in decisions
   2 and 3. Keyboard: arrows move through folders and their open items, and
   Enter or Right opens a folder. Right-click on a Linux app entry keeps
   its menu.
3. Tests for grouping (suite, v1 with a folder, built-in, Linux app), the
   keyboard and search.
4. Walk in Apricot and Classic, light and dark, on a phone-sized viewport
   with Office installed.
5. Corpus: ui-desktop-layer.md (Start), the research pages, status, log.

## Files you OWN

- `StartMenu.tsx` and its tests, the grouping helper beside it
- `catalog.ts` (`folder`) and specs, the listing DTO
- `marketplace/hollow.json` (`folder` only)
- the corpus pages in step 5

## Files you must NOT touch

- The taskbar, pinned icons and the desktop. Folders exist only in Start.

## Acceptance

- Tests green; the walk holds in all four looks.
- With nothing installed, Start looks as it does today.
