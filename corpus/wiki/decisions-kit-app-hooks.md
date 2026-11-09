---
summary: How an installed kit app brings a background service and command-palette sources (owner, 2026-11-06; built in brief 71, walked 2026-11-09) - declared in the descriptor, exported by name beside App, loaded after the desktop is idle so sign-in never waits, a failure kept to that app with one notification. Widgets and desktop layers stay built-in only.
updated: 2026-11-09
---

# Decisions: a kit app's hooks

Settled by the owner on 2026-11-06 for brief 71, so that Todo (a due-date
service) and Bookmarks (palette entries) could leave the image. Built the
same day (`93bf282`, kit 1.5.0) and walked on 2026-11-09. Changing one needs
an explicit revisit and a `log.md` entry.

1. **The descriptor declares each hook.** A suite app may say
   `background: true` and `commandSources: true`. Only an app that declares
   one has its module loaded without a window. *Why:* loading every app's
   module at sign-in would cost every install for the few that need it.
2. **The module exports them by name** beside `App`: `Background` and
   `commandSources`. A declared hook the module doesn't export is a refusal
   that names it, shown like a missing entry.
3. **A failure is contained.** A hook that throws is hidden with one
   notification, like a desktop layer; a module that fails to load costs
   only that app's hooks. Built-in services sit behind the same boundary.
4. **The kit exports the types** (`CommandSource`, its context, the
   windowless handle) from 1.5.0; a command source gets the app's own folders
   as `ctx.data` from 1.6.0, since it has no window to read them through.
5. **Sign-in never waits.** Hook apps load once the desktop is idle, so a
   palette entry or a due-date check may start a beat later. Not measured
   yet with and without a hook app.

Rejected: loading hooks with the registry at sign-in (slower desktop for
every user), and widgets and desktop layers for installed apps (Clock,
Calendar and Sticky Notes, the apps that use them, stay built in; revisit
when an installable app needs one).

Users: Todo's `Background` and Bookmarks' `commandSources`
([recipe](imbatranim-apps-group-recipe.md)). The fixture is
`apps/backend/test/fixtures/hooks-repo.ts`.
