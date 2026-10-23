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
