---
title: FileManager.tsx is a 750-line god component
created: 2026-07-17
status: captured
tags: [add-on, debt]
---

# FileManager.tsx has grown into a god component

Found in the 2026-07-17 review pass (CS-3). `FileManager.tsx` is ~750
lines (`apps/add-ons/file-manager/src/FileManager.tsx`) and mixes several
independent concerns in one component with ~16 `useState` hooks:

- the context-menu descriptor tree, built inline (`FileManager.tsx:336-390`);
- manual window resize wiring — a `ResizeObserver` plus hand-attached
  `mousemove`/`mouseup` listeners for the preview-pane splitter
  (`FileManager.tsx:115-146`);
- keyboard navigation (`handleListKeyDown`, `FileManager.tsx:424` onward);
- two intertwined delete states, `deleteTarget` and `batchDeletePending`
  (declared `FileManager.tsx:92-93`, branched in the delete flow at
  `:251-263`, and re-derived for the dialog at `:457-461`).

Suggested approach: extract `useFileSelection`, `useFileClipboard`, and
`useDeleteFlow` hooks; move the menu tree into a `buildMenuItems(...)`
module; pull the splitter into a reusable resize-handle component; and
collapse the two delete states into one discriminated union
(`{ kind: 'single', target } | { kind: 'batch' }`).

Deferred because it is a large structural refactor of a heavily-used
add-on with high regression surface, not a spot fix. Note: the CS-4
batch-delete / upload error handling in this same file was already fixed
in this pass.
