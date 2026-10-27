# Brief 176 — Rebuild a kit app at the same ref when its kit changed

## Context

Promoted 2026-10-23 from the todo
[kit-app-refusal-and-same-ref-reinstall](../../todos/promoted/kit-app-refusal-and-same-ref-reinstall.md),
second half. Brief 175 takes the first.

When only `sharedKit` changes and the ref stays the same, the Marketplace pane
offers nothing to fix it. In brief 163's walk the only way was
`POST /api/marketplace/apps/<id>/install` by hand.

Why (checked 2026-10-23):

- The backend reports an installed app's `sharedKit` as the one its live build
  was made against, and the catalog's own value only when nothing is built:
  `sharedKit: built ? built.sharedKit : d.sharedKit` in
  [`marketplace.service.ts:322`](../../../apps/backend/src/modules/marketplace/marketplace.service.ts).
  So the desktop cannot see that the catalog now offers a build for its kit.
- The pane's Install / Reinstall / Update button shows only for
  `!installed || missing || outdated`, and `outdated` is
  `installed.ref !== app.ref`
  ([`MarketplaceSettings.tsx:239-262`](../../../apps/core/src/modules/settings/MarketplaceSettings.tsx)).
  A kit mismatch at the same ref sets the row's text to "Needs an update: built
  for shared kit N, this desktop has M" and shows no button.

## Spec

1. Backend: the app view also carries the catalog descriptor's kit (for
   example `catalogSharedKit: number | null`), alongside the build's `sharedKit`.
   Old clients ignore the extra field.
2. Desktop: `MarketplaceApp` in
   [`shared/registry/marketplace.tsx`](../../../apps/core/src/shared/registry/marketplace.tsx)
   gains the field, and an older backend that sends none reads as "unknown".
3. Pane: when the installed build's kit differs from `SHARED_KIT_VERSION` and
   the catalog's kit equals it, show a **Rebuild** button that runs the same
   install as Update. The row text says "Built for shared kit N; a rebuild for
   kit M is available".
4. When the catalog's kit also differs from the desktop's, keep today's text and
   no button: a rebuild would make the same mismatch.

## Must preserve

- `outdated` (a new ref) still shows **Update**; `missing` still shows
  **Reinstall**.
- Sandboxed URL apps keep their own row and "Check for update".
- The install endpoint's behaviour; only the pane gains a way to call it here.

## Acceptance

- A kit app installed at ref R against kit 1, with the catalog bumped to kit 2
  at the same ref on a kit-2 desktop: the row offers **Rebuild**, it runs, and
  the app then opens.
- With the catalog still at kit 1, the row shows the mismatch text and no
  button.
- Backend and pane tests cover both; `npm run lint`, `npm run typecheck`, and
  the core and backend test suites pass.

## Files you OWN

- `apps/backend/src/modules/marketplace/marketplace.service.ts` and its spec
- `apps/core/src/shared/registry/marketplace.tsx` (the type and its doc
  comment) and `marketplace.test.tsx`
- `apps/core/src/modules/settings/MarketplaceSettings.tsx` and its test

## Files you must NOT touch

- `apps/backend/src/modules/marketplace/catalog.ts` schema: the descriptor
  format does not change.
- `apps/core/src/modules/marketplace/` (brief 175).
- `marketplace/imbatranim-office.json` (briefs 164–167).

## Outcome (2026-10-27)

**Built in `ff91201` (version 1.36.0), walked in Chrome in the dev
container** with brief 163's kit fixture installed from a `file://`
descriptor in the container's catalog only (nothing under `marketplace/` in
the repo changed). The backend's app view carries `catalogSharedKit`, what the
descriptor names now, beside the build's `sharedKit`; it is null for a mount
app and a URL app. The desktop's `MarketplaceApp` has it as optional, and a
missing field reads as unknown. `rebuildFixesKit()` in
`shared/registry/marketplace.tsx` decides: installed, a kit app, the build's
kit differs from the desktop's, and the catalog's equals it. Then the row says
"Built for shared kit N; a rebuild for kit M is available" and offers
**Rebuild**, which posts the same install as Update.

What the walk showed, on a kit-1 desktop with the fixture built at ref
`558865f` against kit 99 (standing in for the brief's kit 1 and kit 2):

- Catalog still at kit 99: "Needs an update: built for shared kit 99, this
  desktop has 1", and no Install, Update, Reinstall or Rebuild button.
- The descriptor moved to kit 1 at the same ref: the row offered **Rebuild**
  with the new text. It ran (build id `7bd62b60` to `bea0139e`, ref
  unchanged), the row then said "Installed · 558865f", and the Kit Notes window
  that had shown brief 175's refusal panel remounted with the app running on
  kit 1.

**Tests:** the service has no unit spec; its listing is tested end to end in
`test/marketplace-kit.e2e-spec.ts`, which now checks `catalogSharedKit`
before install (1, and null for a non-kit suite) and beside the build's kit
when the descriptor moves at the same ref (build 1, catalog 99, then both 1
again). `marketplace.test.tsx` covers `rebuildFixesKit` (catalog matches,
catalog differs, field missing, nothing to fix, not installed, a mount app, a
URL app). `MarketplaceSettings.test.tsx` covers Rebuild and its install call,
the mismatch with the catalog at another kit or silent, and Update for a new
ref and Reinstall for a missing build winning over Rebuild. Gates:
`npm run typecheck` (32 tasks), `npm run lint` (31 tasks, no errors), backend
805 unit and 184 e2e, core 526 (run on its own).

**The full `npm test` run fails at the core task, before and after this
brief.** Under the parallel turbo run, core picks up load-dependent errors in
files none of briefs 174 to 176 own: at `0d496f8` (before brief 174) the
sandboxed keyboard-guard test timed out at 14.6 s and an unhandled
`api.put is not a function` came from `marketplace.test.tsx`; at this commit,
an unhandled `EnvironmentTeardownError` from `prefs.ts`'s fire-and-forget
`import()` of the notification store, reported against `prefs.test.ts`. Core
alone passes. Recorded in the todo
[core-tests-flake-under-the-full-run](../../todos/core-tests-flake-under-the-full-run.md).
