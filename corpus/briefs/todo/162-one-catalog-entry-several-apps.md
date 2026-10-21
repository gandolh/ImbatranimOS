# Brief 162 — One catalog entry, several apps

## Context

The owner settled on 2026-10-21 that the office apps leave the OS for their own
repo, `imbatranim-office`, and come back through the marketplace as **one**
catalog entry that installs all five: Docs, Sheets, Slides, PDF and CAD
([decisions-office-suite.md](../../wiki/decisions-office-suite.md), "One Office
entry installs the whole suite"). The marketplace was built for games, so it
cannot do that today. Read in the code on 2026-10-21:

- One descriptor is one app. `descriptorSchema` in
  `apps/backend/src/modules/marketplace/catalog.ts` has `schemaVersion: z.literal(1)`,
  one `build.entry`, one `window`, one `icon`.
- Five descriptors pointing at the same repo would mean five clones, five
  `npm ci` runs and five builds (`marketplace.service.ts`, one
  `apps/<id>@<buildId>` per descriptor).
- Marketplace apps get one window each: `toAppConfig` in
  `apps/core/src/shared/registry/marketplace.tsx` sets `multiInstance: false`
  ("One window per game"). The built-in office apps are `multiInstance: true`.
- Marketplace apps never appear in Open With: `toAppConfig` sets no `opens`,
  and `candidatesFor` in `apps/core/src/shared/registry/associations.ts` reads
  only `opens`.
- The desktop knows twelve icon names (`ICONS` in `marketplace.tsx`), all
  game-shaped. Anything else draws `Package`. The backend already accepts any
  Lucide-shaped name (`iconSchema`).

This brief teaches the marketplace "one descriptor, several apps" and gives
marketplace apps what the built-in office apps have. It does not change how an
app's code is loaded or what it may import: that is
[163](163-the-desktop-shares-its-kit.md).

## Decisions (build calls, made while writing this brief)

1. **A suite descriptor is `schemaVersion: 2` with an `apps` array.** The top
   level keeps what is shared by the build: `id`, `name`, `description`,
   `source`, `type`, `runtime`, `build`, `server`, `minSystemVersion`. Each item
   in `apps` is one app the desktop shows: its own id, name, description, meta,
   entry, window, icon, `opens`, `multiInstance` and capabilities.
2. **Version 1 stays valid and means one app.** At load, a v1 descriptor is
   normalised to the same in-memory shape as a v2 one with a single app whose
   id is the descriptor's id. `marketplace/hollow.json` is not edited and must
   install and run exactly as now.
3. **One install per descriptor.** One clone, one `install`, one `command`, one
   `apps/<descriptorId>@<buildId>` directory, one database row, one log, one
   job. Install, update and uninstall act on the descriptor and so on every app
   in it.
4. **One served directory per descriptor.** A v2 `build` names
   `output` (a directory inside the clone, never `node_modules`) and each app's
   `entry` is a module path *inside* `output`, like `docs/app.mjs`. Only
   `output` is served. Apps of one suite can then share chunks, which a
   multi-entry build emits next to the entries.
5. **One server per descriptor, shared by its apps.** `type` and `server` stay
   at the top level. A window of any of the suite's apps holds a lease on the
   descriptor's server. The four-server cap counts it once.
6. **App ids are global.** An app id follows the descriptor id rule
   (`^[a-z][a-z0-9-]{1,39}$`, never `x-`), and must be unique across every app
   and every descriptor id in the catalog. A built-in id still wins
   (`syncMarketplaceApps`), and the pane reports the clash. A second file that
   reuses an id is skipped and reported, as duplicates are now.
7. **`multiInstance` is per app and defaults to `false`.** Games keep one
   window without saying so. An office app sets `true`.
8. **`opens` is per app and joins the existing association table.** Marketplace
   apps come after built-ins in `APP_REGISTRY`, so where both claim an
   extension the built-in stays the default, and the user can pick the other in
   Open With or set an override. That is the intended state while a built-in
   and its suite version coexist (brief 164 ends it).
9. **Icons: a curated list, grown, and checked.** The whole Lucide map stays out
   of the eager bundle (the reason the list exists). The list gains an office
   set: `file-text`, `file-pen`, `table`, `sheet`, `presentation`,
   `pen-tool`, `drafting-compass`, `ruler`, `briefcase`. A core test reads every
   committed `marketplace/*.json` and fails if one names an icon the list lacks,
   so a descriptor can no longer fall back to `Package` silently.

## Contracts

### A. Descriptor, schema version 2

```json
{
  "schemaVersion": 2,
  "id": "imbatranim-office",
  "name": "Office",
  "description": "Documents, spreadsheets, slides, PDF and CAD.",
  "source": {
    "repo": "https://github.com/gandolh/imbatranim-office",
    "ref": "<40 hex>"
  },
  "type": "static",
  "runtime": "native",
  "build": {
    "install": ["npm", "ci"],
    "command": ["npm", "run", "build:os"],
    "output": "dist/os"
  },
  "apps": [
    {
      "id": "office-docs",
      "name": "Docs",
      "description": "Word documents.",
      "meta": ["office"],
      "entry": "docs/app.mjs",
      "window": { "defaultSize": { "w": 860, "h": 680 }, "minSize": { "w": 480, "h": 380 } },
      "icon": "file-text",
      "opens": ["docx"],
      "multiInstance": true,
      "capabilities": ["fs", "intents", "shortcuts", "notify"]
    }
  ],
  "minSystemVersion": 2
}
```

- `apps`: 1 to 16 items.
- `opens`: up to 40 lowercase extensions or extensionless names, each
  `^[a-z0-9][a-z0-9._+-]{0,30}$`.
- `meta`, `window`, `icon` and `capabilities` mean what they mean in v1, per app.
- `server`, when `type` is `service`, is v1's object unchanged.
- The ids and names above are illustrative. The suite's own brief 01 fixes them.

### B. What the backend lists

`MarketplaceApp` (backend `marketplace.service.ts`, mirrored in core's
`marketplace.tsx`) gains:

- `descriptorId: string`. The descriptor that installs it. For a v1 app it
  equals `id`.
- `multiInstance: boolean`.
- `opens: string[]` (empty when none).

A v2 descriptor lists one `MarketplaceApp` per item in `apps`. Each carries the
descriptor's `ref`, `type`, `installed` (with its own `entryPath`), `job` and
`server`. URL apps (brief 158) gain `descriptorId` equal to their id,
`multiInstance: false` and `opens: []`; nothing else about them changes.

### C. Routes

The routes keyed by `:id` (install, uninstall, log, lease, server proxy, built
files under `apps/:id/b/:buildId/*`) take the **descriptor** id. The desktop
uses `app.descriptorId` for them. For every v1 app and URL app nothing changes,
because the two ids are the same.

### D. Database

A new step after `stepMarketplaceUrlApps` adds a nullable `entries TEXT`
column to `marketplace_apps`: JSON mapping app id to entry path inside
`output`, written when a build succeeds. A row with `entries` null is a v1 row
and keeps using `entry`. The listing reads the entries the build recorded, not
the descriptor, so editing the descriptor without reinstalling cannot point an
app at a file that was never built.

## Chunks

1. **Schema and catalog** (`catalog.ts`, `catalog.spec.ts`): the v2 schema; the
   v1 to v2 normalisation; global id uniqueness across apps and descriptor ids;
   `output` and per-app `entry` rules (inside `output`, `.mjs` or `.js`, no
   `..`). Tests: every rule, plus `hollow.json` still parsing to one app.
2. **Install, listing, serving** (`marketplace.service.ts`,
   `marketplace.controller.ts`, `marketplace-servers.service.ts`, `db.service.ts`):
   build once per descriptor; check every entry exists after the build (a
   missing one fails the job and keeps the previous build live); write
   `entries`; list one app per item; serve `output`; leases and the server keyed
   by descriptor. Unit and e2e tests with a local two-app fixture repo
   (`allowLocalRepos` is already how tests use `file:` repos).
3. **Desktop** (`marketplace.tsx`, `NativeAppHost.tsx`,
   `MarketplaceSettings.tsx`, their tests): `multiInstance` and `opens` from
   the listing; lease and server URLs from `descriptorId`; the grown `ICONS`
   list and the descriptor-icon test; the pane shows a suite descriptor as one
   row (install, update, uninstall, log) with its apps' names under it.
   Enabling and disabling stays per app in Settings → Apps, unchanged.
4. **Docs and corpus** (controller): `marketplace/README.md` documents version
   2 with a two-app example; `decisions-marketplace.md` gets this brief's build
   calls; `status.md`, `log.md`.

## Must preserve

- Brief 120's catalog flow and brief 158's URL flow, with all their tests.
- `marketplace/hollow.json` unedited; Hollow installs, runs in one window, and
  survives close and reopen.
- A built-in id always wins over a marketplace one.
- No change to CSP, to what a module may import, or to `mount`'s contract.
- Built-in add-ons and their associations are untouched.

## Acceptance

- `npm run typecheck`, `npm run lint`, backend unit and e2e tests, and core
  tests pass.
- In the dev container, with a local two-app fixture descriptor:
  - one Install produces one build directory and one log, and both apps appear
    in Start;
  - the app with `multiInstance: true` opens three windows; the other focuses
    its one window;
  - Open With on a file of a claimed extension lists the marketplace app after
    the built-in claimant, and choosing it opens the file there;
  - disabling one of the two apps hides only that one;
  - Uninstall removes both apps and the build directory;
  - a fixture whose build leaves one entry out fails the job and keeps the
    previous build live.
- Hollow installs and runs as before.

## Files you OWN

- `apps/backend/src/modules/marketplace/**`
- `apps/backend/src/db/db.service.ts` (the new step only)
- `apps/core/src/shared/registry/marketplace.tsx` and its test
- `apps/core/src/modules/marketplace/NativeAppHost.tsx` and its test
- `apps/core/src/modules/settings/MarketplaceSettings.tsx`
- `marketplace/README.md`, test fixtures

## Files you must NOT touch

- `marketplace/hollow.json`, `apps/add-ons/**`, `apps/core/src/manifest.ts`
- `packages/ui/src/system.ts` (no protocol change here)
- The sandboxed runtime (`SandboxedAppHost.tsx`, `sandboxBridge.ts`,
  `keyboardGuard.ts`), beyond the three new listing fields
