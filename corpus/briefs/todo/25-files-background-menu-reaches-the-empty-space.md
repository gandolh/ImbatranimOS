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
