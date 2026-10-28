# Brief 183 — Marketplace startup apps open at sign-in

## Context

Found in brief 164's walk (2026-10-28); the owner asked for this brief on
2026-10-28.

A Marketplace app in Settings → Startup never opens when a new tab signs in.
Two effects in [`App.tsx`](../../../apps/core/src/App.tsx) race, and the
startup one always wins:

1. The first effect calls `loadMarketplace()` (around `:37`), which fetches
   `/marketplace` and only then puts the installed apps into `APP_REGISTRY`
   (`syncMarketplaceApps` in
   [`marketplace.tsx`](../../../apps/core/src/shared/registry/marketplace.tsx)).
2. The startup effect (around `:150`) calls `runStartupApps()` synchronously
   in the same commit. `startupCandidates()` in
   [`startup.ts`](../../../apps/core/src/shared/lib/startup.ts) keeps only
   ids already in `APP_REGISTRY`, so every Marketplace id is dropped, and the
   tab's once-only marker is already set when the listing arrives.

Brief 164 now moves the owner's `docs` startup entry to `office-docs`, so the
bug hides a choice the owner made before the move. It was true for every
Marketplace app before that.

The same cause shows in Settings → Startup: `byId` is memoised once per mount
(around `:33`), so a Marketplace app in the list is left out of the pane when
the pane mounted before the listing arrived.

## Spec

1. At boot, when the startup list names an id that is not in the registry yet
   (and is not disabled), wait for the first Marketplace listing to settle,
   then open the whole set in the list's order. The pane promises "in this
   order, the last one ends up in front", so the built-ins wait with the
   Marketplace apps rather than opening first. When every listed id is
   already registered, nothing waits and the set opens as now.
2. The wait ends on success or failure. If the listing fails, open what is
   registered and skip the rest.
3. Decide "a layout was restored" and "this tab already ran" before the wait,
   as now; the wait never turns a skipped boot into a run.
4. Only the first listing of the tab counts. Settings' own `loadMarketplace`
   calls, and installs during the session, open nothing. StrictMode runs
   App's effects twice in development; the set still opens once.
5. Settings → Startup recomputes from the registry when it changes (the
   registry store's `version`), so a Marketplace app in the list shows by
   name once the listing is in.

Pick the smallest wiring (one way: App's startup effect hands the promise
from `loadMarketplace()` to `runStartupApps`), and say which in the outcome.

## Must preserve

- Brief 82's rules: once per tab, never over a restored layout, disabled apps
  skipped (and kept in the list), an unknown id skipped without breaking boot.
- A startup list of built-ins only opens in the same commit as now, with no
  wait.
- `marketplace.tsx`'s registry sync and its `lastKey` guard behave as now.
- Nothing of a Marketplace app is fetched before its window opens (brief 182).

## Acceptance

- Unit tests: a Marketplace id opens once its listing arrives, in list order
  with the built-ins; a failed listing still opens the built-ins; a restored
  layout or a tab that already ran opens nothing after the listing; a second
  listing opens nothing.
- In Chrome on the dev container, with Office installed and the startup list
  holding Terminal then `office-docs`: a new tab opens both, Docs in front. A
  reload of that tab opens nothing new. With `/marketplace` failing, a new
  tab still opens Terminal.
- Settings → Startup lists Office's Docs by name in a new tab.
- `npm run typecheck`, `npm run lint`, `npm test -w @imbatranim/core` pass.

## Files you OWN

- `apps/core/src/shared/lib/startup.ts` and `startup.test.ts`
- `apps/core/src/App.tsx` (the boot effects only)
- `apps/core/src/modules/settings/StartupSettings.tsx` and its tests
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/registry/marketplace.tsx`: use its promise, don't
  change it.
- `apps/core/src/shared/store/*`, `startupStore.ts` included: briefs 164–167
  and 169 own it.
