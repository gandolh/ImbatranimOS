# Brief 71 — Catalog apps bring background services and command sources

## Context

Todo and Bookmarks can't leave the image yet, because a catalog app can't
declare what their manifests do:
- Todo has a `background` service that fires due-date toasts;
- Bookmarks has `commandSources` that feed the command palette.

Built-ins declare these in `AppConfig` and `AddonManifest`
(`apps/core/src/contract.ts`), and the shell mounts them from the registry:
- `BackgroundServices.tsx` mounts each enabled app's `background` in a
  `WindowlessSystemProvider`;
- `manifest.ts` registers command sources once.

A catalog app is spliced into the registry at runtime
(`apps/core/src/shared/registry/marketplace.tsx`), and its module loads only
when a window opens (`KitAppHost`, `kitModule.ts`, `kitPreload.ts`). Widgets
and desktop layers aren't needed: Clock, Calendar and Sticky Notes stay built
in. Promoted from the todo
`catalog-apps-bring-background-services-and-commands`.

## Owner decisions (settled 2026-11-06)

1. **The descriptor declares each hook.** A suite app gains optional
   `background: true` and `commandSources: true`. Only an app that declares
   one has its module loaded without a window.
2. **The module exports them by name** next to `App`: `Background` and
   `commandSources`. A declared hook the module doesn't export is a refusal
   that names it, shown like a missing entry.
3. **A failure is contained.** A hook that throws is hidden with one
   notification, like a desktop layer today, and a module that fails to load
   costs only that app's hooks.
4. **The next kit minor** at build time, exporting `CommandSource` with its
   context type and the windowless handle's type.
5. **Sign-in never waits.** Hook apps load after the desktop is interactive,
   so a palette entry or a due-date check may start a beat later.

## What to do

1. **Catalog** (`apps/backend/src/modules/marketplace/catalog.ts`): the two
   fields on `suiteAppSchema`, passed through the listing, with spec cases
   for a valid and a refused descriptor.
2. **Desktop:**
   - after the desktop is interactive, import each installed kit app that
     declares a hook, through the existing preload path;
   - its exports join its registry entry, so `BackgroundServices` and the
     palette treat it like a built-in;
   - disabling or uninstalling unmounts and unregisters them, and a rebuild
     remounts them.
3. **Kit:** the types of decision 4, and a kit minor bump with
   `SHARED_KIT_MODULES` updated if anything new is shared.
4. **Fixture:** a kit app declaring both hooks shows that:
   - the background ticks with no window open;
   - its command shows in the palette;
   - disabling it removes both;
   - a declared but missing export is refused by name.
5. **Measure** sign-in to an interactive desktop, with and without one hook
   app installed, in the dev container. It must not change.
6. **Corpus:** decisions-marketplace-suites.md (the hooks and decisions 1-3),
   status, log. Widgets and desktop layers are left for when an installable
   app needs them.

## Files you OWN

- `catalog.ts` and specs, the listing DTO
- `apps/core/src/shared/registry/marketplace.tsx`,
  `apps/core/src/modules/marketplace/` (module loading, preload),
  `BackgroundServices.tsx` and the palette's source registry as far as they
  read the registry
- `packages/ui/src/sharedKit.ts` and the exported types, the fixture, the
  corpus pages

## Files you must NOT touch

- Any add-on, and `marketplace/*.json`.

## Acceptance

- Tests green; the fixture behaves as listed; sign-in is unchanged;
- Office installs and opens unchanged.

## Outcome (2026-11-09)

Built on 2026-11-06 by a subagent from the main session, walked on
2026-11-09; ready for deploy. Commit: `93bf282` (1.206.0, kit 1.5.0). A
command source got the app's own folders as `ctx.data` later, in `98e41ff`
(kit 1.6.0, brief 75).

What was built:
- **Catalog:** `background` and `commandSources` (optional booleans) on a
  suite app, passed through the listing and the recorded build; descriptors
  refuse unknown keys. Spec cases for valid and refused descriptors.
- **Desktop** (`kitHooks.tsx`): once the page is idle after sign-in, each
  installed, enabled kit app that declares a hook has its module imported
  through the preload path; its `Background` joins its registry entry and
  `BackgroundServices` mounts it in the windowless provider, with its own
  identity; its `commandSources` join the palette and Start's search. A
  declared hook the module doesn't export is a refusal that names it (shown
  like a missing entry); a module that fails to load, or a hook that
  throws, costs only that app's hooks, with one notification. Built-in
  services sit behind a boundary too. Disabling or uninstalling unmounts and
  unregisters; a rebuild remounts from the fresh module.
- **Kit 1.5.0:** `CommandSource`, its context type and the windowless
  handle's type are exported.
- **Fixture:** `apps/backend/test/fixtures/hooks-repo.ts`, a kit app that
  declares both hooks, used by the marketplace-kit e2e and the walk.

Walk (walk-71, 2026-11-09, dev container at `64283c7`, the kit-hooks fixture
at `cdc057e`): PASS on install; the background service running with no
window; its palette entries; one run per tab; the fail command contained
(one toast, the desktop fine); a declared but missing export refused by
name; disable and re-enable in Settings; uninstall (icon, palette entries
and service gone); reinstall (a fresh module).

Not walked: the sign-in measurement with and without a hook app (acceptance
"sign-in is unchanged" rests on the hooks loading after idle, unmeasured);
Office unchanged was seen only in passing (it stayed installed with its
icons). Observed: the refusal toast for the fixture's declared-but-missing
export ("Hookless") shows once per desktop load, and again on reinstall.
Accessories (brief 75) is the first real user of both hooks.

Owner steps: push imbatranim-apps first, then imbatranimOS, then `node
cli.ts imbatranim-os deploy` from vps-deploy.
