> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [catalog-apps-bring-background-widgets-layers-and-commands](../../todos/catalog-apps-bring-background-widgets-layers-and-commands.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 54 — Catalog apps bring background services, widgets, desktop layers and commands

## Context

[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
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
Briefs 59 and 60 move them.

## Owner decisions

Approved 2026-11-06: the contract grows so these apps can leave. The smaller
calls, with the default this brief builds:

1. **The descriptor says which hooks an app has.** A suite app gains
   optional `background: true`, `widgets: [{ id, name, defaultSize }]`,
   `desktopLayer: true` and `commandSources: true`. Only an app that
   declares a hook has its module loaded at sign-in; the others still load
   when a window opens. Default: yes.
2. **The module exports them by name.** Next to `App` come `Background`,
   `widgets` (id → component), `DesktopLayer` and `commandSources`. A
   declared hook the module doesn't export is a refusal that names it, shown
   the way a missing entry is. Default: yes.
3. **A failure stays contained.** A hook that throws is hidden with one
   notification, like a desktop layer today. A module that fails to load at
   sign-in costs only that app's hooks. Default: yes.
4. **The next kit minor at build time** (1.4.0 if nothing else has taken
   it), the props and types exported from the kit
   (`CommandSource` and its context, `WidgetConfig`'s shape, the windowless
   handle). An older desktop ignores the new fields. Default: yes.

## What to do

1. Catalog schema (`apps/backend/src/modules/marketplace/catalog.ts`): add
   the four fields of decision 1 to `suiteAppSchema`, with limits: at most 4
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
3. Kit (`packages/ui`): export the types of decision 4, bump the kit's
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
6. Corpus: decisions-marketplace-suites.md (the hooks and decisions 1-3),
   the research page's wave 2 line, status, log.

## Files you OWN

- `apps/backend/src/modules/marketplace/catalog.ts` and specs, the listing
  DTO
- `apps/core/src/shared/registry/marketplace.tsx`,
  `apps/core/src/modules/marketplace/` (host, module loading, preload),
  `BackgroundServices.tsx` and the widget, layer and command-palette hosts
  as far as they read the registry
- `packages/ui/src/sharedKit.ts` and the exported types
- the fixture, the corpus pages in step 6

## Files you must NOT touch

- Any add-on. Built-ins keep declaring hooks in their manifests.
- `marketplace/*.json`, since no catalog entry uses the hooks yet.

## Acceptance

- Tests green; step 4's fixture behaves as listed in the dev container.
- Sign-in with no hook app installed is as fast as before; the step 5 numbers
  are in the outcome.
- Office installs and opens unchanged.
