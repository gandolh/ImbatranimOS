# Brief 163 — The desktop shares its kit with marketplace apps

## Context

Settled 2026-10-21 ([decisions-office-suite.md](../../wiki/decisions-office-suite.md),
"The desktop shares its React and UI kit with marketplace apps"): the office
apps move to `imbatranim-office` and must stay OS apps, with the same buttons,
dialogs, theme and hooks as the built-ins. Today a marketplace module cannot
have that:

- `marketplace/README.md`: "The module must be self-contained. It cannot import
  the desktop's React or `@imbatranim/ui`; bundle what it needs."
- `NativeAppHost.tsx` hands a module a DOM node (`mount(container, system,
  host)`), and `scopeHandle.ts` says why: "it never shares core's React".
- The built-in office add-ons are written against `@imbatranim/ui` (kit
  components, `useSystem()`, `saveOverRead`, `UnsavedChangesDialog`, the
  `SystemProvider` that `WindowContainer.tsx` wraps every app in). Moved as they
  are, they need the desktop's *instances* of React and the kit: a second React
  copy cannot read the desktop's `SystemContext`, and its hooks would throw.
- Kit classes are compiled by the desktop's Tailwind, which scans
  `packages/ui` and `apps/add-ons` (`apps/core/src/index.css`). Classes that
  only a suite app uses are not in the desktop's CSS.

This brief adds a second way to run a catalog app, beside `mount`: a **kit
app**, a React component the desktop renders in its own tree with its own React
and kit. Depends on [162](../done/162-one-catalog-entry-several-apps.md) (the v2
descriptor this adds two fields to).

## Decisions (build calls, made while writing this brief)

1. **The shared modules travel on a global, not an import map.** Before it
   loads any kit app, the desktop sets `globalThis.__imbatranimShared` to a
   frozen object of module namespaces, keyed by specifier. A kit app's build
   marks those specifiers external and rewrites each import to a read from that
   object. An import map was rejected: it is an inline script, which
   `script-src 'self'` refuses unless the CSP gains a hash, and it must exist
   before the first module of the page loads, which a runtime install cannot
   promise. Passing the modules to `mount` was rejected because ES imports
   resolve when the module loads, before any function of it runs, so every
   moved file would have to stop importing React.
2. **The shared set is small and named.** `react`, `react/jsx-runtime`,
   `react-dom`, `react-dom/client` and `@imbatranim/ui`. Icons, react-query and
   everything else stay bundled by the app. Adding a key later is additive; a
   removal or an incompatible change is a version bump (3).
3. **The kit is a versioned contract.** `@imbatranim/ui` exports
   `SHARED_KIT_VERSION`, an integer, starting at 1. It goes up when a shared
   module changes incompatibly: a React major, a kit export removed or its props
   changed in a breaking way. A v2 descriptor declares the version its build
   was made against in a top-level `sharedKit` field. The desktop refuses to
   render a kit app whose `sharedKit` differs, with a sentence in the window's
   error panel, and the pane shows the same as "needs an update".
4. **A kit app exports a component.** Its module exports
   `App: ComponentType<{ windowId: string; host: NativeHostContext }>`. The
   desktop renders it inside the window's existing `AppErrorBoundary`,
   `SystemProvider` and `Suspense`, with a nested `SystemProvider` holding the
   scoped handle (`scopeHandle`, unchanged), so `useSystem()` works and still
   fences capabilities. `host` is the same object `mount` receives today.
5. **A kit app ships its own stylesheet.** A v2 app may list `styles`, `.css`
   files inside `output`. The desktop adds each as a `<link rel="stylesheet">`
   the first time any app of that build opens, and removes them when the build
   changes or is uninstalled. The app's CSS is utilities only, compiled with the
   same Tailwind major as the desktop and **without** preflight or a theme of its
   own. Its token names resolve to the desktop's CSS variables.
6. **The theme tokens move into the kit.** The `@theme` block in
   `apps/core/src/index.css` moves to `packages/ui/src/theme.css`, imported by
   `index.css`, so the token names are part of the kit an outside repo snapshots
   (7). No token value changes.
7. **An outside repo builds against a snapshot.** There is no registry
   (decisions-iso-era.md, build from source). A kit app's repo commits a copy
   of `packages/ui/src` from a named OS commit and uses it for types, tests and
   Tailwind's token names; at bundle time the specifiers stay external. The
   README says so and names the files. The OS publishes nothing new.
8. **Trust does not change.** A catalog app already runs in the desktop's page
   at full speed (decisions-marketplace.md); sharing the page's React gives it
   nothing it could not already reach. Kit apps are catalog-only. URL apps keep
   the sandbox and never see the global.

## Contracts

### A. The global

```ts
// Set by the desktop before the first kit app loads. Frozen, as are its values.
globalThis.__imbatranimShared = {
  version: SHARED_KIT_VERSION, // number
  modules: {
    react: ReactNamespace,
    'react/jsx-runtime': JsxRuntimeNamespace,
    'react-dom': ReactDomNamespace,
    'react-dom/client': ReactDomClientNamespace,
    '@imbatranim/ui': KitNamespace,
  },
}
```

The values are the namespaces the desktop's own bundle imports
(`import * as React from 'react'`), so identity holds: the context a kit app
reads is the desktop's.

### B. Descriptor additions (v2 only)

- top level: `sharedKit: number` (integer, at least 1). Present means every app
  of the descriptor is a kit app; absent means every app uses `mount`. One
  descriptor does not mix the two.
- per app: `styles: string[]` (0 to 8 paths inside `output`, each ending in
  `.css`). Allowed only with `sharedKit`.

The listing (`MarketplaceApp`) gains `sharedKit: number | null` and, per app,
`stylePaths: string[]` (served paths, like `entryPath`).

### C. The module

```ts
export const App: ComponentType<{ windowId: string; host: NativeHostContext }>
```

No `mount` and no `unmount`: React mounts and unmounts it. Anything it starts
outside React (a worker, a socket) it stops in an effect cleanup.

## Chunks

1. **Kit side** (`packages/ui`): `SHARED_KIT_VERSION`; `theme.css` holding the
   moved `@theme` block, imported by `apps/core/src/index.css`; a test that the
   built desktop CSS is unchanged (compare the token block before and after).
2. **The global and the host** (`apps/core/src/modules/marketplace/`): a small
   module that builds and freezes `__imbatranimShared` from the desktop's own
   imports; a `KitAppHost` that checks the version, injects styles once per
   build, loads the module through `loadModule`, wraps `App` in the scoped
   `SystemProvider`, and holds the service lease. The lease code moves out of
   `NativeAppHost` into a hook both hosts use. `toAppConfig` picks the host from
   `sharedKit`.
3. **Backend** (`catalog.ts`, `marketplace.service.ts`): the two fields, their
   rules, `stylePaths` in the listing; style files must exist after the build,
   like entries.
4. **Tests**: a fixture kit app built in the test (an ESM file that reads React
   and the kit from the global) renders in a window; `useSystem()` inside it
   returns a scoped handle that throws on an unlisted capability; a kit
   `ConfirmDialog` opens; a `sharedKit` mismatch shows the error panel; two
   windows of one build inject one `<link>`, and uninstall removes it; a v1
   `mount` app (Hollow's shape) is unaffected.
5. **Docs and corpus** (controller): `marketplace/README.md` replaces the
   "cannot import" paragraph with a "Kit apps" section (the global, the
   externals, the snapshot, the CSS rule, the version); `ui-conventions.md`
   notes that a kit app follows the same rules as an add-on;
   `decisions-marketplace.md`, glossary ("shared kit", "kit app"), `status.md`,
   `log.md`.

## Must preserve

- `mount(container, system, host)` and every app that uses it, Hollow included.
- CSP unchanged. No inline script, no import map, no `'wasm-unsafe-eval'`.
- URL apps and their sandbox unchanged; the global is never visible to a frame.
- The desktop's eager bundle does not grow by more than the host code: the kit
  and React are already in it.
- Every built-in add-on renders exactly as before.

## Acceptance

- `npm run typecheck`, `npm run lint`, backend unit and e2e tests, and core
  tests pass.
- In Chrome on the dev container, a local fixture kit app installed through a v2
  descriptor:
  - opens in a window that looks like a built-in (kit buttons, a kit dialog,
    the accent following Settings);
  - reads a file through `system.fs` and saves it back with `saveOverRead`;
  - shows an error panel naming both versions when its `sharedKit` is changed
    to 99 and reinstalled;
  - leaves no `<link>` behind after uninstall.
- Hollow installs and runs as before.

## Files you OWN

- `packages/ui/src/index.ts`, new `packages/ui/src/theme.css`
- `apps/core/src/index.css` (the moved block only)
- `apps/core/src/modules/marketplace/**` (new `KitAppHost.tsx`, the shared
  global module, the lease hook)
- `apps/core/src/shared/registry/marketplace.tsx`
- `apps/backend/src/modules/marketplace/catalog.ts`, `marketplace.service.ts`
- `marketplace/README.md`, test fixtures

## Files you must NOT touch

- `packages/ui/src/system.ts`: this is not a protocol change, and
  `PROTOCOL_VERSION` stays 2.
- `apps/add-ons/**`
- `apps/backend/src/security-headers.ts`
