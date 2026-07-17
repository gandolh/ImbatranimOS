---
title: Inconsistent destructive-action confirmation UX across add-ons
created: 2026-07-17
status: captured
tags: [add-on, debt, core-contract]
---

# Destructive actions confirm three different ways

Found in the 2026-07-17 review pass (CS-12). The same class of action —
deleting user data — is confirmed three inconsistent ways across the
add-ons:

- Bookmarks uses the browser-native `confirm()` for deleting a group
  (`apps/add-ons/bookmarks/src/Bookmarks.tsx:291`) but deleting a link
  has no confirmation at all
  (`apps/add-ons/bookmarks/src/Bookmarks.tsx:297`, with the trigger at
  `:91`).
- Sticky Notes deletes with no confirmation
  (`apps/add-ons/sticky-notes/src/StickyNotes.tsx:164-166`, button at
  `:199`).
- File Manager uses a proper themed `Dialog`
  (`apps/add-ons/file-manager/src/FileManager.tsx:713`).

A browser-native `confirm()` dialog is especially out of place inside a
custom Win7-classic desktop shell — it breaks the illusion the OS is
built around.

Suggested approach: add a shared `useConfirm()` hook / `<ConfirmDialog>`
to `@imbatranim/core` and route every destructive action through it, so
confirmation is uniform and themed.

Deferred because it needs a core-contract addition (a new shared
surface), which is a deliberate decision rather than a per-add-on patch.
Relates to the wider shared-surface work — see
[office-addon-shared-helpers.md](./office-addon-shared-helpers.md).
