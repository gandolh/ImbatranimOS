> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [image-viewer-and-media-player-join-accessories](../../todos/image-viewer-and-media-player-join-accessories.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 57 — Image Viewer and Media Player join Accessories

## Context

The two Accessories apps that open files
([research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)):

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
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

Brief 56 (the Accessories group exists).

## Owner decisions

Approved 2026-11-06: a fresh OS has no image viewer or media player until
Accessories is installed. The smaller call, with the default this brief
builds:

1. **Files' own previews stay.** Files' preview pane is Files' own code and
   still shows images and plays media without Accessories. Default: yes,
   untouched.

## What to do

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

## Files you OWN

- in imbatranim-apps: the two apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`,
  `marketplaceOpeners.ts` and its tests, the two `apps/add-ons/` folders
  (deleted), their `manifest.ts` lines, `package-lock.json`, the corpus
  pages

## Files you must NOT touch

- Files' preview pane, the tray volume, the auto-lock code.

## Acceptance

- Tests green in both repos; the walk holds, auto-lock included.
