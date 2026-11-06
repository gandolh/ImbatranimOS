---
title: Archive Manager joins Accessories
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Archive Manager joins Accessories

Archive Manager joins Accessories. Files' Extract and Compress open it today and do nothing when it's missing, so they hide without it, and a zip's Open With chooser names Accessories.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); Archive Manager goes to Accessories.

1. **Does the `archive` module stay in the OS, with only the app moving?** Proposed: yes (Claude's default of 2026-11-06), as for the other blocked apps.
2. **Does Files hide Extract and Compress without Archive Manager, and a zip's chooser name Accessories?** Proposed: yes.
3. **Or should Archive Manager stay in the base, since Files uses it for Extract and Compress?** Proposed: move it; the base keeps Files' menus working by hiding them.

## Draft brief

### Context

The last app
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
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
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[Calculator, Paint and Snipping Tool](calculator-paint-and-snipping-tool-install-as-accessories.md) (the Accessories
group).

### What to do

1. The checklist's steps 1-4, added to `accessories.json` with a new pin.
2. Question 2: the Files menu entries follow whether Archive Manager is
   enabled; the nine types go into `SUITE_TYPES` as "Accessories". Tests for
   both.
3. The walk (checklist step 6):
   - the before state is a zip in the home folder and a folder to compress;
   - without Accessories, the menu has no Extract or Compress, and the zip's
     chooser names Accessories;
   - with it, extracting and compressing work from Files and from the app,
     and a long extract still reports progress.
4. Corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: Archive Manager in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, Files' Extract and
  Compress entries and their tests, `marketplaceOpeners.ts`,
  `apps/add-ons/archive-manager/` (deleted), its `manifest.ts` line,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- `apps/backend/src/modules/archive/`, per question 1.

### Acceptance

- Tests green in both repos; the walk holds.
