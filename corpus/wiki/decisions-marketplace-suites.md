---
summary: The marketplace's calls for suites (brief 162) and kit apps (brief 163), 2026-10-21 — a v2 row keeps its output in `entry`, the listing trusts what the build recorded (entries, and a kit app's stylesheets and shared kit version), the shared global holds frozen copies of the namespaces, the registry sync prunes a gone build's stylesheet links, the theme tokens are static, and the dev container can try a local `file://` checkout.
updated: 2026-10-21
---

# Decisions: suites and kit apps in the marketplace

Split out of [decisions-marketplace.md](decisions-marketplace.md), which holds
brief 120's catalog calls and brief 158's URL apps. Changing one needs an
explicit revisit and a `log.md` entry.

## Brief 162: one catalog entry, several apps (2026-10-21)

The office suite comes back from its own repository as one catalog entry
([decisions-office-suite.md](decisions-office-suite.md)). The brief fixed the
shape (`schemaVersion: 2` with an `apps` array; one build, row, log, served
directory and server per descriptor; one id namespace; per-app
`multiInstance` and `opens`; a checked icon list). The build added these.

- **A v2 row keeps its output in `entry`.** Contract D adds one column,
  `entries` (app id → module inside the output). The row must also know the
  served directory without reading the descriptor, or an edited `output`
  would serve a directory that was never built. `entry` is NOT NULL and
  otherwise unused on a v2 row, so it holds the output, and a non-null
  `entries` is what marks the shape. A v1 row is written exactly as before
  (`entry` the module, `entries` null). Rejected: a second new column, which
  the contract didn't list.
- **The listing trusts what the build recorded.** An app added to a
  descriptor after the install lists as installed but missing (no
  `entryPath`, Reinstall offered). A row whose `entries` is damaged lists
  every app as missing instead of failing the listing.
- **An app may reuse its own descriptor's id**; that is what a v1 descriptor
  reads as. Otherwise `loadCatalog` checks ids across files in name order and
  skips the later file whole.
- **`descriptorName` joins the listing**, beside contract B's three fields.
  A suite's row in the pane is headed by the descriptor's name ("Office"),
  and nothing else in the listing carries it. It equals `name` for a v1 or URL
  app.
- **Each entry's real path must be inside the output's.** v1 only checked
  inside the app's directory, so an entry symlinked out of the served
  directory installed and then 404ed. A missing output is reported as its
  first missing entry.
- **The pane names a clash with a built-in before anything is installed.**
  `syncMarketplaceApps` records the listed ids a built-in already has, and
  `loadMarketplace` refreshes them without remounting open windows.
- **The dev container can try a local checkout.** The dev profile passes
  `MARKETPLACE_ALLOW_LOCAL_REPOS` through, off by default
  (`MARKETPLACE_ALLOW_LOCAL_REPOS=true npm run dev`). The `file://`
  repository has to be a path inside the container, so it is copied in with
  `docker cp` (the walk used `/home/imbatranim/fixtures/`, on the dev volume).
  Rejected: syncing a fixture repository through `compose watch`, which would
  put a nested `.git` under `apps/` or `marketplace/`.

## Brief 163: the desktop shares its kit (2026-10-21)

Kit apps: a v2 descriptor with `sharedKit` describes components the desktop
renders with its own React and `@imbatranim/ui`, read from
`globalThis.__imbatranimShared`. The brief fixed the global, the two
descriptor fields, the `App` export, the version rule and the theme move. The
build added these.

- **The live build records a kit app's stylesheets and shared kit version.**
  In `entries`, a kit app's value is `{ entry, styles, sharedKit }`; a mount
  app's stays the module's path, so a 162 row reads as before. The listing's
  `sharedKit` and `stylePaths` come from there for an installed app, so a
  descriptor edited to `sharedKit` before its reinstall still opens the mount
  build it has, and a changed version takes effect at the next install.
  Rejected: a new column (a ledger step, and a backup that 1.22 could not
  restore); the descriptor's current value (the kit host would load a module
  that exports `mount`).
- **The global holds frozen copies of the namespaces.** A real ES namespace
  can't be frozen, and the dev server and the test runner hand over real
  ones; the values are the desktop's own objects, so identity holds. A
  CommonJS module's `module.exports` is spread in first, so every React
  export is a property whatever the bundler's interop. The property is
  read-only and non-configurable. Rejected: the bare namespaces.
- **The page is the record of a build's stylesheets.** Each link carries
  `data-kit-build="<descriptor>@<build>"`; the host adds what is missing,
  and `syncMarketplaceApps` removes the links of every build it no longer
  holds. Closing the last window keeps them. Rejected: counting windows
  (the brief says per build, and a reopen would fetch again); a map in the
  lazy host chunk (the eager registry would have to load it to prune).
- **A window waits for its stylesheets**, 10 seconds at most, before it
  renders the app, so the first frame is not unstyled.
- **The theme tokens are `@theme static`.** Every token in
  `packages/ui/src/theme.css` is a CSS variable at runtime. The built desktop
  CSS gained the 18 tokens no desktop class used (about 0.7 kB); no value or
  rule changed (a diff of the two builds; `theme.test.ts` pins the values).
  Tailwind 4.3's reference mode also writes a token's value as a `var()`
  fallback, but a kit stylesheet built any other way names a bare variable.
- **The kit exports the props types.** `SHARED_KIT_VERSION`,
  `SHARED_KIT_MODULES`, `NativeHostContext` and `KitAppProps` live in
  `packages/ui/src/sharedKit.ts`, so an outside snapshot has them; core's
  `scopeHandle.ts` re-exports `NativeHostContext`. `SHARED_KIT_VERSION` is
  declared inline because the office repo's snapshot script reads that line.
- **Refused, not ignored.** A v1 descriptor with `sharedKit` and a v2 one
  with `styles` but no `sharedKit` are catalog problems, instead of a
  stripped field that would fail only when a window opens.
- **The pane says "Needs an update"** for a kit app whose version differs
  (`MarketplaceSettings.tsx`, one state line, outside the brief's file list).
