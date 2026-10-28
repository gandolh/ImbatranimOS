# Brief 166 — Retire the built-in Sheets

## Context

The Sheets run of [brief 164](../done/164-retiring-a-built-in-office-app.md)'s
hand-over: remove the built-in once its imbatranim-office version has passed
its walk in the OS (imbatranim-office brief 08). Brief 164's Docs run builds the migration
that moves the owner's choices to the new id; this run adds its id pair to it.

| Built-in id | Package | Suite app id | Extensions |
|---|---|---|---|
| `sheets` | `apps/add-ons/sheets` | `office-sheets` | `xlsx`, `xls`, `csv` |

Hard-coded: `newFileTemplates.ts` in the file manager returns `'sheets'`; brief
164 makes it resolve the opener for the new file's name instead, so check New →
Spreadsheet opens the suite app.

## Steps

1. Read the walk brief's outcome. Every line passed in Chrome against this OS
   with the suite installed from the catalog; otherwise stop.
2. Add the id pair to brief 164's migration (associations, the disabled set,
   desktop icons, startup apps, recents attribution); it runs once per pair and
   records that it ran.
3. Remove the package, its line in `apps/core/src/manifest.ts`, its workspace
   entry and the lockfile entries only it used.
4. Fix the hard-coded references named above, then grep for the old id again.
5. With the suite uninstalled, a file of these types shows the chooser with
   the Marketplace sentence brief 164 added.
6. Move the office catalog entry's pin if the walk changed the suite
   (`marketplace/imbatranim-office.json`).
7. Corpus: `status.md`, `log.md`, and the dated notes brief 164 step 6 lists.

## Acceptance

- `npm run typecheck`, `npm run lint`, backend and core tests pass.
- In Chrome on the dev container, with the suite installed: a file of these
  types opens in the suite app on double-click; an override set before the run
  still applies; desktop icons and recents survive.
- With the suite uninstalled: the chooser names the Marketplace.
- The production image builds and does not grow.

## Files you OWN

- the package(s) in the table (to delete)
- `apps/core/src/manifest.ts`, `apps/core/src/shared/registry/associations.ts`
- the migration in `apps/core/src/shared/store/*`
- root `package.json` workspaces, `package-lock.json`
- `marketplace/imbatranim-office.json` (the pin only)
