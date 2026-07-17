---
title: Add-on cleanup nits from the shared-kit migration
created: 2026-07-17
status: captured
tags: [add-on, debt, cleanup]
---

# Add-on cleanup nits (post brief 23)

Low-severity leftovers surfaced by the brief 23 shared-addon-kit migration
and its review pass. None affect runtime behavior; batch them into a future
tidy pass.

- **Dead `zustand` dependency in four add-ons.** `apps/add-ons/{docs,sheets,
  slides,pdf-viewer}/package.json` still list `zustand` in `dependencies`,
  but none of them import it directly anymore — their per-app
  `store/openedFileStore.ts` was deleted and they now consume
  `createOpenedFileStore`/`useOpenIntent` through `@imbatranim/core` (which
  owns the zustand dep). Drop the four unused entries and regenerate the root
  lockfile in one step (don't hand-edit `package.json` without the matching
  `npm install`, or the single root lockfile drifts — see brief 16).

- **Native `prompt()` still in notepad.** `apps/add-ons/notepad/src/components/
  FileBrowser.tsx` uses `window.prompt(...)` for new-file / new-directory
  names (the native `confirm()` was replaced with the shared `ConfirmDialog`
  in brief 23, but `prompt()` was out of that scope). A native prompt is as
  out-of-place in the custom desktop shell as the confirm was; consider a
  shared themed text-input dialog (`usePrompt()` alongside
  [the shared ConfirmDialog from brief 23](../briefs/done/23-shared-addon-kit.md)).
