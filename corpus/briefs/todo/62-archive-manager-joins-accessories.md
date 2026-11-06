# Brief 62 — Archive Manager joins Accessories

## Context

The last app
[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked:
- **Archive Manager** (`apps/add-ons/archive-manager`, 923 source and 52 test
  lines) calls `http`, `intents`, `notify` and `window`.
- It opens zip tar gz tgz bz2 tbz2 tbz xz txz.
- It leans on the `archive` module (2,164 lines: list, extract, extract
  jobs, compress, inside the home folder).

Files depends on it: its context menu's Extract and Compress call
`system.intents.openApp('archive-manager', …)` (`FileManager.tsx`), and
`openApp` on a missing id only warns in the console. The owner approved
moving it on 2026-11-06 ("looks good, write the briefs").

Follow the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

Brief 56 (the Accessories group).

## Owner decisions

1. **The module stays in the OS.** Not yet confirmed: this is Claude's
   default from 2026-11-06, and the owner can overrule it. `archive` stays in
   `apps/backend`, and the installed app calls it as before.
2. **Files without Archive Manager.** Extract and Compress are hidden. A
   zip's Open With chooser names Accessories, through `SUITE_TYPES`.
   Default: yes.

## What to do

1. The checklist's steps 1-4, added to `accessories.json` with a new pin.
2. Decision 2: the Files menu entries follow whether Archive Manager is
   enabled; the nine types go into `SUITE_TYPES` as "Accessories". Tests for
   both.
3. The walk (checklist step 6):
   - the before state is a zip in the home folder and a folder to compress;
   - without Accessories, the menu has no Extract or Compress, and the zip's
     chooser names Accessories;
   - with it, extracting and compressing work from Files and from the app,
     and a long extract still reports progress.
4. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: Archive Manager in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, Files' Extract and
  Compress entries and their tests, `marketplaceOpeners.ts`,
  `apps/add-ons/archive-manager/` (deleted), its `manifest.ts` line,
  `package-lock.json`, the corpus pages

## Files you must NOT touch

- `apps/backend/src/modules/archive/`, per decision 1.

## Acceptance

- Tests green in both repos; the walk holds.
