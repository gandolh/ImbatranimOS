> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [todo-sticky-notes-and-bookmarks-join-accessories](../../todos/todo-sticky-notes-and-bookmarks-join-accessories.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 60 — Todo, Sticky Notes and Bookmarks join Accessories

## Context

Three more of the apps
[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked, each by one hook:

| App | Source / tests | Backend module | Hook | System calls |
|---|---|---|---|---|
| Todo | 1,641 / 296 | `todos` (584) | `background` (due dates) | `http`, `notify`, `schedule` |
| Sticky Notes | 1,103 / 137 | `sticky-notes` (326) | `desktopLayer` (the notes on the desktop) | `http`, `notify` |
| Bookmarks | 1,726 / 566 | `bookmarks` (888) | `commandSources` (the palette) | `fs`, `http`, `intents`, `notify` |

Bookmarks also reads the Browser's config (`/browser/config`). The Browser
stays in the base. The owner approved moving all three on 2026-11-06 ("looks
good, write the briefs"), and kept Bookmarks as its own app rather than
folding it into the Browser.

Follow the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

Brief 54 (the hooks) and brief 56 (the Accessories group).

## Owner decisions

1. **The backend modules stay in the OS.** Not yet confirmed: this is
   Claude's default from 2026-11-06, and the owner can overrule it, as in
   brief 59. Lists, notes and bookmarks survive an uninstall, and nothing is
   migrated.
2. **Sticky notes after an uninstall.** The notes leave the desktop and come
   back with the app. They are data in the module, not files, so nothing is
   lost. Default: yes.

## What to do

1. The checklist's steps 1-4 for the three apps, added to
   `accessories.json` with a new pin:
   - Todo declares `background: true`;
   - Sticky Notes declares `desktopLayer: true`;
   - Bookmarks declares `commandSources: true`;
   - each exports its hook by name (brief 54).
2. The walk (checklist step 6):
   - the before state is a todo due in two minutes, three sticky notes on
     the desktop, and a bookmark group that the palette finds;
   - after removing them, nothing fires, no notes are on the desktop, and
     the palette shows no bookmarks;
   - after installing Accessories, the due toast arrives once with two tabs
     open, the notes are back where they were, and the palette finds the
     bookmark;
   - after uninstalling and reinstalling, the data is still there.
3. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the three apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, the three
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

## Files you must NOT touch

- `apps/backend/src/modules/todos/`, `sticky-notes/`, `bookmarks/` and
  `browser/`, per decision 1.
- The Browser add-on.

## Acceptance

- Tests green in both repos; the walk holds, the data survival included.
