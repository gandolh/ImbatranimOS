---
summary: The marketplace's calls for suites (several apps from one descriptor, brief 162, 2026-10-21) — a v2 row keeps its output in `entry`, the listing trusts the recorded entries, `descriptorName` joins the listing, entries must resolve inside the output, and the dev container can try a local `file://` checkout.
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
