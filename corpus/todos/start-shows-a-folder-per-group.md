---
title: Start shows a folder per group
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Start shows a folder per group

Start shows a folder per install group, like Windows 7's All Programs, instead of one flat list that already passes 30 entries. Office is a group already, so this needs nothing from the apps repo.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); a Start folder per group.

1. **What makes a folder?** Proposed: a suite descriptor is a folder named by its `name`; a v1 descriptor joins one through a new `folder` field (Hollow → "Games"); built-ins and URL apps stay at the top level; Linux apps get one "Linux apps" folder.
2. **Does a folder expand in place or cascade as a submenu?** Proposed: in place, remembered for the session; a cascade is harder on the phone.
3. **Does Start's search still find apps inside folders?** Proposed: yes.
4. **Do the base apps get a folder too, like Windows 7's System Tools, or stay at the top level?** Proposed: top level, so the seven base apps are one tap away.

## Draft brief

### Context

Start's app list is flat, in registry order
(`apps/core/src/shared/components/taskbar/StartMenu.tsx`). With Office's five
apps, Hollow and Linux apps beside the built-ins, it already passes 30
entries, and every install group adds more.
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#2-install-groups-and-start-folders)
proposed one Start folder per install group, like Windows 7's "All
Programs". This fits the locked Win7-classic layout. The owner approved it on
2026-11-06 ("looks good, write the briefs").

Office is a group already, so this can run before
[Games](games-install-from-imbatranim-apps.md).

### What to do

1. Catalog: add an optional `folder` to v1 descriptors (a name, up to 40
   characters), passed through the listing. Give `marketplace/hollow.json`
   `"folder": "Games"`.
2. Start: group the enabled apps as in question 1, with folders after the
   top-level apps, both in the current order. Folders behave as in decisions
   2 and 3. Keyboard: arrows move through folders and their open items, and
   Enter or Right opens a folder. Right-click on a Linux app entry keeps
   its menu.
3. Tests for grouping (suite, v1 with a folder, built-in, Linux app), the
   keyboard and search.
4. Walk in Apricot and Classic, light and dark, on a phone-sized viewport
   with Office installed.
5. Corpus: ui-desktop-layer.md (Start), the research pages, status, log.

### Files you OWN

- `StartMenu.tsx` and its tests, the grouping helper beside it
- `catalog.ts` (`folder`) and specs, the listing DTO
- `marketplace/hollow.json` (`folder` only)
- the corpus pages in step 5

### Files you must NOT touch

- The taskbar, pinned icons and the desktop. Folders exist only in Start.

### Acceptance

- Tests green; the walk holds in all four looks.
- With nothing installed, Start looks as it does today.
