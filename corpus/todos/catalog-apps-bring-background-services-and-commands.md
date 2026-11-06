---
title: Catalog apps bring background services and command sources
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# Catalog apps bring background services and command sources

A catalog app can bring a background service and command-palette sources, the two hooks Todo and Bookmarks need before they can leave the image. A kit contract change in this repo that moves no app. Widgets and desktop layers wait until an installable app needs them, since Clock, Calendar and Sticky Notes stay built in.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.


> PROMOTED 2026-11-06 to [brief 71](../briefs/todo/71-catalog-apps-bring-background-services-and-commands.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

Settled in the grill on 2026-11-06: only `background` and `commandSources` are needed now; the questions below about widgets and layers apply when one is added. Before that, the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); the kit contract grows so these apps can leave.

1. **Does the descriptor declare each hook (`background`, `widgets`, `desktopLayer`, `commandSources`), so only the apps that have one load at sign-in?** Answered 2026-11-06: yes.
2. **Does the module export them by name next to `App`, with a declared hook it doesn't export refused by name?** Answered 2026-11-06: yes.
3. **Does a failing hook stay contained (hidden, with one notification), and a module that fails at sign-in cost only its own hooks?** Answered 2026-11-06: yes.
4. **Which kit version?** Answered 2026-11-06: yes.
5. **How much sign-in time may each installed hook app add?** Answered 2026-11-06: none. Hook apps always load after the desktop is interactive, so sign-in never waits on them; a widget or a sticky note may appear a beat after the desktop. The brief still measures, to show sign-in is unchanged.

## Draft brief

### Context

[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
lists five built-in apps that can't leave the image because a catalog app
can't declare what their manifests do:

| Hook | On | Used by |
|---|---|---|
| `background` | `AppConfig` (`apps/core/src/contract.ts`) | Clock, Calendar, Todo |
| `widgets` | `AppConfig` | Clock, Calendar (and System Monitor, which stays) |
| `desktopLayer` | `AppConfig` | Sticky Notes |
| `commandSources` | `AddonManifest` | Bookmarks |

The shell mounts these from the registry, not from a window:
`BackgroundServices.tsx` mounts each enabled app's `background` in a
`WindowlessSystemProvider`, the desktop hosts widgets and layers, and
`manifest.ts` registers command sources once. A catalog app is spliced into
the registry at runtime (`apps/core/src/shared/registry/marketplace.tsx`),
and its module loads only when a window opens (`KitAppHost`, `kitModule.ts`,
`kitPreload.ts`).

The owner approved moving those apps on 2026-11-06 ("looks good, write the
briefs"). This brief is the contract change they wait for. It moves no app.
[Clock and Calendar](clock-and-calendar-join-accessories.md) and
[Todo, Sticky Notes and Bookmarks](todo-and-bookmarks-install-as-accessories.md) move them.

### What to do

1. Catalog schema (`apps/backend/src/modules/marketplace/catalog.ts`): add
   the four fields of question 1 to `suiteAppSchema`, with limits: at most 4
   widgets, ids like an app id, sizes like a window's. The listing passes
   them through. Add spec cases for a valid and a refused descriptor.
2. Desktop:
   - an installed kit app that declares a hook gets its module imported at
     sign-in, after the boot-critical work, through the existing preload
     path;
   - its exports go into its registry entry, so `BackgroundServices`, the
     widget host, the desktop layer host and the command palette treat it
     like a built-in;
   - disable and uninstall unmount them, as for a built-in;
   - a rebuild remounts them.
3. Kit (`packages/ui`): export the types of question 4, bump the kit's
   minor, and update `SHARED_KIT_MODULES` if a new module is shared.
4. A test fixture, a kit app declaring all four hooks, proves:
   - the background ticks with no window open;
   - the widget can be added from the desktop menu;
   - the layer draws;
   - its command shows in the palette;
   - disabling it removes all four;
   - a missing export is refused by name.
5. Measure sign-in: time to an interactive desktop, with and without one
   hook app installed, in the dev container.
6. Corpus: decisions-marketplace-suites.md (the hooks and questions 1-3),
   the research page's wave 2 line, status, log.

### Files you OWN

- `apps/backend/src/modules/marketplace/catalog.ts` and specs, the listing
  DTO
- `apps/core/src/shared/registry/marketplace.tsx`,
  `apps/core/src/modules/marketplace/` (host, module loading, preload),
  `BackgroundServices.tsx` and the widget, layer and command-palette hosts
  as far as they read the registry
- `packages/ui/src/sharedKit.ts` and the exported types
- the fixture, the corpus pages in step 6

### Files you must NOT touch

- Any add-on. Built-ins keep declaring hooks in their manifests.
- `marketplace/*.json`, since no catalog entry uses the hooks yet.

### Acceptance

- Tests green; step 4's fixture behaves as listed in the dev container.
- Sign-in with no hook app installed is as fast as before; the step 5 numbers
  are in the outcome.
- Office installs and opens unchanged.
