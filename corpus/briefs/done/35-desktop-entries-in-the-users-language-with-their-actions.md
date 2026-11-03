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

## Outcome (2026-11-03)

**Built in `70cd3fa` (version 1.130.0).**
1. `desktop-entry.ts` reads `Name`, `GenericName` and `Comment` with their
   localized keys (the `.ENCODING` part dropped, the first value of a key
   kept) and the `[Desktop Action <id>]` groups `Actions=` lists, each with
   its `Name`, localized names and `Exec`; an action without a `Name` or an
   `Exec` is skipped.
2. **The matcher runs in the backend, not the desktop**, a deviation from the
   spec's wording: `pickLocalized` matches a browser language the way the
   spec matches a locale (`lang_COUNTRY@MODIFIER`, `lang_COUNTRY`,
   `lang@MODIFIER`, `lang`; a BCP 47 script such as `Latn` read as
   `@latin`), first language first, else the plain value. The desktop sends
   `navigator.languages` with `GET /linux-apps/launchers`, so the choice is
   still the browser's, there is one matcher, and it is tested where the
   acceptance put the tests. The entry carries the chosen name and comment,
   not every translation.
3. Actions: each launcher lists its actions (named the same way; one whose
   `Exec` names no program is left out). `POST
   /linux-apps/launchers/:id/actions/:action/launch` starts one as the entry
   starts, behind the same live-session check. Start gives a Linux entry with
   actions a right-click menu (Open, then the actions); Start now ignores
   presses and Escape while that menu, drawn in a portal, is open. A Linux
   window's task-button menu lists its app's actions first (a Linux window's
   app id is the launcher's when the app names itself after its desktop
   file, as Firefox does).

**Checked:**
- `desktop-entry.spec.ts` (9): localized keys and actions, an incomplete
  action, the matcher's order, scripts as modifiers, several languages and
  none. The service spec (24 in the module): entries and actions named per
  language, the languages parsed, an action launched only from a live session
  and only one the entry has. Core: the launchers ask in
  `navigator.languages` and post to the action route (4); Start's entry menu
  lists, launches and opens, and a press in it leaves Start open (4).
- In the dev container, with Firefox and LXTerminal installed from the pane:
  in a Romanian browser (`ro-RO`) LXTerminal's entry reads "Utilizează linia
  de comandă" (its `Comment[ro]`; its `Name[ro]` is the plain name), and in
  Esperanto its name reads "LXTerminalo". Firefox's entry and its task button
  offer New Private Window, New Window and Profile Manager; Open started
  Firefox, and New Window with no Firefox running started it too.
- **Not met:** "it opens a second Firefox window". New Window while Firefox
  runs showed Firefox's "already running, but is not responding" dialog:
  Firefox passes a second launch to the running one over D-Bus, and the
  Linux apps layer has no session bus. Filed as the todo
  `linux-apps-dbus-session-bus`.
- Typecheck, lint; core's full suite (675) and the backend's linux-apps and
  wayland specs (51).
