---
title: Start gets search, pinned apps and an A-Z list
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Start gets search, pinned apps and an A-Z list

Start's flat list in registry order gives way to the layout most current desktops use: a search field at the top, a grid of pinned apps, and one A-Z list of every app below it, built in, installed or Linux. Groups stay a Marketplace idea and add no folders. This repo only.

Decided in the imbatranim-apps grill on 2026-11-06. The owner first chose
folders, then said "Pick best ui/ux, we are not stuck with win7 style", and
Claude picked this. It replaces the "Start shows a folder per group" todo.
Grill the open questions below when the work starts, then promote this to a
numbered brief.

## Open questions (grill before starting)

Settled on 2026-11-06:
- search on top, then pinned apps, then all apps A to Z;
- no folders, so installed groups' apps and Linux apps sit in the A-Z list
  like any other;
- Recent files stays.

1. **Which apps are pinned on a fresh OS?** Proposed: Files, Terminal,
   Browser, Code Editor, Notepad and Settings. Pin and unpin from an app's
   right-click or long-press menu in Start.
2. **What does the search find?** Proposed: apps by name and meta words, then
   files, using the command palette's sources so the two never disagree.
   Enter opens the first result.
3. **Focus on open?** Proposed: the search field takes the keyboard when
   Start opens with a physical keyboard, so typing just works. On a touch
   device it doesn't, so the phone's keyboard doesn't cover Start.
4. **Are Linux apps marked?** Proposed: a small "Linux" tag in the A-Z
   list, since they behave differently (a streamed window).

## Draft brief

### Context

`apps/core/src/shared/components/taskbar/StartMenu.tsx` shows:
- the brand header;
- every enabled app in registry order, with no search and no pins;
- Recent files;
- Lock and Log off.

Desktop icons can already be pinned (`desktopStore.ts`), and the command
palette (`CommandPalette.tsx`) already searches apps and files. With Office,
Games, Developer, Accessories and Linux apps installed, the list passes 30
entries.

### What to do

1. A Start pins store (a dotfile, like the desktop's), with the defaults
   from question 1, and Pin to Start / Unpin in each entry's menu. Linux
   apps' desktop actions stay in that menu.
2. The search field per questions 2 and 3, reusing the command palette's
   sources, with arrow keys through results and Enter to open.
3. The pinned grid, then an A-Z list with letter headers. Installed and
   Linux apps sort in by name, with the Linux tag per question 4.
4. Tests:
   - pins persist and default;
   - search ranks apps before files;
   - keyboard order;
   - an installed app and a Linux app appear in the A-Z list.
5. A walk in Apricot and Classic, light and dark, at desktop and phone
   width.
6. Corpus: `ui-desktop-layer.md` (Start), the research pages, status, log.

### Files you OWN

- `StartMenu.tsx` and its tests, a Start pins store, the shared search
  source the palette and Start both read

### Files you must NOT touch

- The taskbar, desktop icons and their pins, and the command palette's own
  UI.

### Acceptance

- Tests green; the walk holds in all four looks and at both widths.
