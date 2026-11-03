# Brief 35 — Desktop entries in the user's language, with their actions

## Context

`apps/backend/src/modules/linux-apps/desktop-entry.ts` reads the plain
`Name` of a `.desktop` file ("Localized keys (`Name[ro]`) are left for
later") and no desktop actions, so Start shows English names and no "New
Window" for Firefox. Split out of the todo `linux-apps-after-the-first-wave`
with the owner on 2026-11-03.

## Spec

1. Parse the localized keys (`Name[xx]`, `Name[xx_YY]`, and the same for
   `GenericName` and `Comment`) and send them with the entry.
2. The desktop picks the name by the browser's `navigator.languages`, the
   way the Desktop Entry spec matches locales (`ro_RO`, then `ro`), and
   falls back to the plain key. The OS has no language setting of its own.
3. Parse `Actions=` and each `[Desktop Action <id>]` group (`Name`, its
   localized keys, `Exec`). Start and the taskbar show them in the entry's
   context menu, and choosing one launches its `Exec` the same way the
   entry's own launches.

## Must preserve

- The launch checks of the Linux apps pane: an action launches only from
  the tab that holds the session, as the entry does.

## Acceptance

- `desktop-entry.spec.ts` covers localized names, the locale matching and
  actions.
- In a browser whose first language is Romanian, an app with a `Name[ro]`
  shows it in Start; Firefox's context menu in Start offers New Window, and
  it opens a second Firefox window.
- Typecheck, lint and the tests of the files changed pass.

## Files you OWN

- `apps/backend/src/modules/linux-apps/desktop-entry.ts` and its spec
- `apps/backend/src/modules/linux-apps/linux-apps.service.ts` (sending
  actions, launching one)
- the Start and taskbar files that draw a Linux entry's menu
