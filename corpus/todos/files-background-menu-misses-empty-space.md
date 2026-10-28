---
title: Files' background menu misses the empty space below a short listing
created: 2026-10-28
status: open
tags: [file-manager, context-menu, ux]
---

# Files' background menu misses the empty space below a short listing

Found in brief 164's walk on 2026-10-28. In a folder with a few entries, a
right-click on the empty part of the listing, below the last row, opens no
menu, so New Folder, New Document and Paste are out of reach there. In such
a folder the background menu opens only from the listing's header row.

The cause: the element with `onContextMenu={openBackgroundMenu}` in
`apps/add-ons/file-manager/src/FileManager.tsx` (the `tabIndex={0}` div with
`min-h-full`, inside the `ScrollArea`) is only as tall as its content. The
scroll viewport around it gives `min-h-full` no definite height to resolve
against, so in brief 164's walk folder (two files) the div was 76 px high in a
pane about 380 px high. Its `onClick` (clear the selection) has the same
reach.

Making that div fill the viewport, or moving both handlers to the viewport,
would fix it. Not in brief 164's files, which own only the New menu's items.
