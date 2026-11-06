# Brief 72 — Start gets search, pinned apps and an A-Z list

## Context

Start (`apps/core/src/shared/components/taskbar/StartMenu.tsx`) has:
- the brand header;
- every enabled app in registry order, with no search and no pins;
- Recent files;
- Lock and Log off.

With Office, Games, Developer, Accessories and Linux apps installed, the list
passes 30 entries. The owner chose the layout current desktops use, not
Windows 7's folders ("Pick best ui/ux, we are not stuck with win7 style";
[decisions-themes.md](../../wiki/decisions-themes.md#starts-contents-follow-current-desktops-not-windows-7)).
Desktop icons can already be pinned (`desktopStore.ts`), and the command
palette (`CommandPalette.tsx`) already searches apps and files. Promoted from
the todo `start-gets-search-pins-and-an-a-to-z-list`.

## Owner decisions (settled 2026-11-06)

1. **Layout:** search on top, then a grid of pinned apps, then one A-Z list of
   every app, built in, installed or Linux, with no folders. Recent files
   stays.
2. **Default pins:** Files, Terminal, Browser, Code Editor, Notepad, Settings.
   Pin to Start and Unpin are in an entry's right-click or long-press menu.
3. **Search:** it finds apps by name and meta words first, then files, using
   the command palette's sources so the two never disagree. Enter opens the
   top result.
4. **Focus:** with a physical keyboard, the search field takes the keyboard
   as Start opens, so typing just works. On a touch device it waits for a
   tap, so the phone's keyboard doesn't cover Start.
5. **No marks:** Linux apps look like every other entry, with no tag.

## What to do

1. **A Start pins store**, a dotfile like the desktop's, with the default
   pins, and Pin to Start / Unpin in each entry's menu. Linux apps' desktop
   actions stay in that menu.
2. **The search field** per decisions 3 and 4, reusing the palette's sources,
   with arrow keys through the results.
3. **The pinned grid**, then the A-Z list with letter headers.
4. **Tests:**
   - pins persist, and default as listed;
   - search ranks apps before files;
   - keyboard order: search, results, grid, list;
   - an installed app and a Linux app appear in the A-Z list;
   - an app that is switched off appears nowhere.
5. **A walk** in Apricot and Classic, light and dark, at desktop and phone
   width.
6. **Corpus:** `ui-desktop-layer.md` (Start), status, log.

## Files you OWN

- `StartMenu.tsx` and its tests, a Start pins store, the shared search source
  the palette and Start both read, the corpus pages

## Files you must NOT touch

- The taskbar, desktop icons and their pins, and the palette's own UI.

## Acceptance

- Tests green; the walk holds in all four looks at both widths.
