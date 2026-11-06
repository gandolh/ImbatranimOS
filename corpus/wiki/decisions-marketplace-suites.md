---
summary: The marketplace's calls for suites (2026-10-21) and kit apps (2026-10-21), 2026-10-21 — a v2 row keeps its output in `entry`, the listing trusts what the build recorded (entries, and a kit app's stylesheets and shared kit version) and, since the same-ref rebuild (2026-10-27) (2026-10-27), reports the catalog's kit beside it so the pane can offer a rebuild, the shared global holds frozen copies of the namespaces, the registry sync prunes a gone build's stylesheet links, the theme tokens are static, and the dev container can try a local `file://` checkout; a kit app asks for its server when it needs one, instead of the host leasing it before the app renders (2026-11-03).
updated: 2026-11-03
---

# Decisions: suites and kit apps in the marketplace

Split out of [decisions-marketplace.md](decisions-marketplace.md), which holds
the marketplace install's catalog calls and sandboxed apps from a URL's URL apps. Changing one needs an
explicit revisit and a `log.md` entry.

## One catalog entry, several apps (2026-10-21): one catalog entry, several apps (2026-10-21)

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

## The shared kit (2026-10-21): the desktop shares its kit (2026-10-21)

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
- **The listing reports the catalog's kit beside the build's** (the same-ref rebuild (2026-10-27),
  2026-10-27). An installed app's `sharedKit` stays what its live build was
  made against, so the desktop runs a build the way it was built;
  `catalogSharedKit` is what the descriptor names now (null for a mount app
  and a URL app). The pane offers **Rebuild** at the same ref only when the
  build's kit differs from the desktop's and the catalog's equals it. Rejected:
  reporting the catalog's kit as `sharedKit`, which would make the desktop
  load a build against a kit it was not made for. A backend without the field
  reads as unknown and offers nothing.

## A kit app asks for its server when it needs one (2026-11-03)

Decided in a grill with the owner, for imbatranim-office's DWG opening (its
todo "every Office window waits on, and fails with, the suite server"). Today
the host leases a `service` descriptor's server before any of its apps
renders, and a failed lease stops the window. Instead the kit lets an app
ask for its server at the moment it needs one (CAD on its first DWG) and
handle a failure itself; an app that never asks never waits and never fails
on it. Rejected: a per-app `server: true` flag, which keeps the four other
Office apps static but still makes every CAD window wait for the cold start,
even for a DXF. The cost: a kit contract change (the kit grows a call to
lease the app's server) and a change to how `KitAppHost` hosts kit apps.
Built the same day as `system.server.request()` (kit 1.2.0); a kit app's
`host.server` is now always null.


## An app keeps its data in a folder of its own (2026-11-06)

Decided in the imbatranim-apps grill. An installable app keeps its data as
real files in a folder of its own, `~/.local/share/imbatranim/<app-id>/`.
Todo and Bookmarks, the installable apps with data in a backend module
today (rows in `~/.imbatranim/db.sqlite`), move their data there, and so do
Git GUI's recent repos. Built-in apps (Clock, Calendar, Sticky Notes) keep
their modules. This is how Windows
gives a program AppData and Linux gives one `~/.local/share`. The OS gives
every app its folder through `system`, scoped so an app sees only its own,
and today's data moves there once.

**Why:** the owner wants the OS laid out like a real one, with a predefined
place per app. Real files fit "the OS is real": Files can show them, and
backups take them with the home folder. The REST API Client already keeps
its collections as a file (`~/.config/rest-client/collections.json`).

Rejected:
- the modules staying in the OS: no migration, but the OS keeps backend code
  for apps that may not be installed;
- a per-app space in the database: data the owner can't see or copy;
- a server per group: about 100 MB and a cold start on the 1 GiB box.

Consequences:
- two tabs can save one file, so a save carries the version it read, and a
  stale one is refused;
- each module is deleted once its data has moved;
- the schedule claims that stop two tabs toasting the same reminder stay in
  the OS.

## The OS keeps the minimum; apps add on top (2026-11-06)

Decided in the same grill, by the owner: "We should keep as OS services the
minimal work that needs them. The apps can be installable if they provide
extra features that the OS don't need or just an UI."

The OS keeps what it needs to work as an OS, plus the services that need
the server:
- Files extracts and compresses archives itself, through the `archive`
  service, with no app installed. Archive Manager is an installable app that
  adds browsing inside an archive and choosing what to extract.
- The `git` and `http-proxy` services stay, trimmed to the work that needs
  the server: running git on repos in the home folder, and sending a request
  behind the SSRF guard. Git GUI and the REST API Client are the features
  and UI on top, and their data (recent repos, collections) goes to their
  data folder.
- The same reading covers the rest. Files' previews show images and play
  media without Image Viewer or Media Player, Notepad edits text without the
  Code Editor, and the taskbar has its clock without Clock.

**The base serves a normal user** (owner, same grill): "someone who uses it
for normal use (browsing, media, etc), small coding (like web dev or system
programming) and we should support basic functionalities native in the os".
The OS is opinionated towards a development environment, so these are built
in:
- Settings, Files, Terminal, Notepad, System Monitor, Logs and the Browser;
- the Code Editor with Diff;
- Image Viewer and Media Player ("png handling should be done by the system
  as an essential feature");
- Calculator, Clock, Calendar, Paint, Snipping Tool and Sticky Notes.

Installable from imbatranim-apps: Minesweeper and Solitaire, Git GUI, the
REST API Client, Todo and Bookmarks, and Office. Markdown Editor folds into
Notepad, and Archive Manager into Files.

**Why:** a fresh OS should still do the basics a real one does. An app
earns its place in the Marketplace by adding to that, not by holding a piece
the OS needs.

Rejected:
- moving the services into group servers: a cold start and about 100 MB
  while open, with the SSRF guard outside the OS;
- keeping Git GUI, the REST API Client and Archive Manager built in.
