---
title: Image Viewer and Media Player join Accessories
created: 2026-11-06
status: dropped
tags: [imbatranim-apps]
---

# Image Viewer and Media Player join Accessories

Image Viewer and Media Player join Accessories. A fresh OS then opens no images, audio or video until Accessories is installed, and the Open With chooser says so, as it does for Office's types.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

> DROPPED 2026-11-06 in the imbatranim-apps grill: Image Viewer and Media Player stay built in ("png handling should be done by the system as an essential feature"). The chooser's Marketplace link answered here moved to [the-chooser-links-to-the-marketplace](the-chooser-links-to-the-marketplace.md).

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); a fresh OS has no image viewer or media player; the chooser names Accessories.

1. **Do Files' own previews keep showing images and playing media without Accessories?** Proposed: yes, untouched.
2. **Should the chooser's sentence carry an Install button?** Answered 2026-11-06: no button. The sentence gets a link that opens Settings → Marketplace on that group's row, for Office's types as well. Built here, since this todo adds the first non-Office types.

## Draft brief

### Context

The two Accessories apps that open files
([research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)):

| App | Source / tests | System calls | Opens |
|---|---|---|---|
| Image Viewer | 910 / 172 | `fs`, `http` | png jpg jpeg gif webp bmp svg avif ico |
| Media Player | 2,050 / 453 | `fs`, `http`, `notify` | mp3 wav ogg oga flac m4a aac opus mp4 webm ogv mov m4v mkv |

Without them installed, a fresh OS opens none of those types. The Open With
chooser already handles that case for Office: `SUITE_TYPES` in
`apps/add-ons/file-manager/src/lib/marketplaceOpeners.ts` names the group to
install. The owner accepted this on 2026-11-06 ("looks good, write the
briefs").

The Media Player plays at the tray's volume (`system.sound`, kit 1.3.0, always
present). The desktop stops auto-lock while media plays, so check that it
still does when the player is a kit app.

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[Calculator, Paint and Snipping Tool](calculator-paint-and-snipping-tool-install-as-accessories.md) (the Accessories
group exists).

### What to do

1. The checklist's steps 1-4 for the two apps, added to `accessories.json`
   with a new pin.
2. Add every type in the table to `SUITE_TYPES` as "Accessories", with a
   test for one image and one video type.
3. Check that auto-lock stays off while a video plays in the installed Media
   Player, and comes back after.
4. The walk (checklist step 6):
   - the before state is a `.jpg` default and a recent video;
   - without Accessories, a `.png` and an `.mp3` show the chooser's sentence
     naming Accessories;
   - with it, both open, the default and the recent come back, and the
     player follows the tray volume.
5. Image bytes and corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: the two apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`,
  `marketplaceOpeners.ts` and its tests, the two `apps/add-ons/` folders
  (deleted), their `manifest.ts` lines, `package-lock.json`, the corpus
  pages

### Files you must NOT touch

- Files' preview pane, the tray volume, the auto-lock code.

### Acceptance

- Tests green in both repos; the walk holds, auto-lock included.
