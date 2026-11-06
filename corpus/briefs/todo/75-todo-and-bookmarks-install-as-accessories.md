# Brief 75 — Todo and Bookmarks install as Accessories

## Context

Todo and Bookmarks leave the image and install together as the Accessories
group. They are the installable organisers for a normal user
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)).
Promoted from the todo `todo-and-bookmarks-install-as-accessories`.

| App | Source / tests | Module today | Hook | System calls |
|---|---|---|---|---|
| Todo | 1,641 / 296 | `todos` (584 lines) | `background` (due dates) | `http`, `notify`, `schedule` |
| Bookmarks | 1,726 / 566 | `bookmarks` (888 lines) | `commandSources` | `fs`, `http`, `intents`, `notify` |

Bookmarks also reads the Browser's config (`/browser/config`); the Browser
stays built in. The steps every move shares are the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

- brief 64, for the group layout;
- brief 69 (`system.data`);
- brief 70 (Bookmarks' import and export by grant);
- brief 71 (the two hooks).

## Owner decisions (settled 2026-11-06)

1. **The group.** The two install together as Accessories (descriptor id
   `accessories`), keeping their ids `todo` and `bookmarks`.
2. **The data** moves once from the `todos` and `bookmarks` modules into JSON
   files in each app's data folder. Todo keeps one file per list. Bookmarks
   keeps one file of groups and links, and its HTML import stays.
3. **The move** happens in the OS backend at the first boot after the
   release that ships this. It writes each table's rows into the app's
   folder, owned by the app and private, and the modules go in the same
   release. A failed write keeps the rows and says so in Logs.
4. **Uninstalling** keeps the data unless "Also remove its data" is ticked.
   Due-date toasts and palette entries stop until the app is back.

## What to do

1. The checklist's steps 1-4 for both apps, in a new Accessories group:
   - Todo declares `background: true` and Bookmarks `commandSources: true`,
     each exported by name;
   - their stores read and write through `system.data` instead of `/todos`
     and `/bookmarks`.
2. The one-time move per decision 3, then delete the `todos` and `bookmarks`
   modules. Due-date toasts keep claiming through `claimScheduleOccurrence`.
3. The walk (checklist step 6):
   - **Before:** a todo due in two minutes, and a bookmark group the palette
     finds.
   - **After the update:** the data is files in the folders; with Accessories
     installed the toast arrives once with two tabs open, and the palette
     finds the bookmark.
   - **After an uninstall:** no toast, no palette entries, and the files stay.
   - **After a reinstall:** both are back.
4. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`,
  `apps/add-ons/todo/` and `apps/add-ons/bookmarks/` (deleted), their
  `manifest.ts` lines, the `todos` and `bookmarks` modules (deleted), the
  one-time move, `package-lock.json`, the corpus pages

## Files you must NOT touch

- The Browser and its module; `schedule`.

## Acceptance

- Tests green in both repos; the walk holds.
