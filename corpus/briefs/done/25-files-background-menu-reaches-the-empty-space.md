# Brief 25 — Files' background menu reaches the empty space

## Context

Found in a walk on 2026-10-28. In a folder with a few entries, a right-click
on the empty part of the listing, below the last row, opens no menu, so New
Folder, New Document and Paste are out of reach there. In such a folder the
background menu opens only from the listing's header row.

The cause: the element with `onContextMenu={openBackgroundMenu}` in
`apps/add-ons/file-manager/src/FileManager.tsx` (the `tabIndex={0}` div with
`min-h-full`, inside the `ScrollArea`) is only as tall as its content. The
scroll viewport round it gives `min-h-full` no definite height to resolve
against, so in a two-file folder the div was 76 px high in a pane about
380 px high. Its `onClick` (clear the selection) has the same short reach.
Promoted from the todo `files-background-menu-misses-empty-space`.

## Spec

1. Make the handlers reach the whole pane: either the div fills the scroll
   viewport's height, or `onContextMenu` and `onClick` move to the viewport.
   Pick the one that keeps the div's focus ring and keyboard handling as
   they are.
2. A right-click on a row still opens the row's menu, not the background
   menu.

## Acceptance

- In a folder with two files, a right-click below the last row opens the
  background menu (New Folder, New Document, Paste), and a click there
  clears the selection.
- In a folder long enough to scroll, both still work at the bottom after
  scrolling.
- A test covers the right-click below the rows; typecheck, lint and the file
  manager's tests pass.

## Files you OWN

- `apps/add-ons/file-manager/src/FileManager.tsx`
- its tests

## Outcome (2026-11-03)

**Built in `8323063` (version 1.113.0).** The first option: the listing fills the
scroll viewport. File Manager's `ScrollArea` takes `[container-type:size]`
and the listing `min-h-[100cqh]`, 100% of that container's height, which is
the viewport's. `min-h-full` couldn't work: the kit's scroll content wraps
the listing and has no definite height. Nothing moved to the viewport, so the
listing's focus ring, `tabIndex` and key handling are as they were, and
`packages/ui` is untouched. The search results list (`SearchResults.tsx`)
has the same `min-h-full` pattern; it wasn't in this brief and was left.

**Checked:**
- In the dev container, Chromium at 1280×800, Apricot light: in a folder with
  two files the listing is 384 px tall, the pane's height (its rows end
  74 px down); a right-click 12 px above the pane's bottom lands on the
  listing and opens New File…, New Folder, Upload…, Paste and Refresh, and a
  click there clears a selected row (5 filled cells to 0).
- In a 60-file folder the rows fill the listing to its bottom, so after
  scrolling to the end the bottom is the last row, and a right-click there
  opens the row's menu.
- A replica of the scroll area's structure in Chromium: 2 rows give a
  400 px listing in a 400 px pane with nothing to scroll; 60 rows give
  1200 px.
- `FileManager.test.tsx` (3): the listing has `min-h-[100cqh]` inside a
  size container; a right-click on the listing opens the background menu
  (New Folder, New Document, Paste); one on a row opens the row's (Rename).
  The file manager's tests (88), typecheck and lint pass.
