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

## Outcome (2026-10-28)

**Built in `78741ee` (version 1.63.0), walked in Chrome against the dev
container.** The wiring picked: App's Marketplace effect keeps the promise
from its own `loadMarketplace()` in a ref, and the startup effect, which runs
after it in the same commit, hands that promise to `runStartupApps`.
`marketplace.tsx` is unchanged. `runStartupApps` now returns a promise of the
ids it opened. It decides as before whether to run at all (the tab's marker,
a restored layout), then, only when the list names an id that is not
registered and not disabled, waits for the listing to settle (success or
failure) and opens the whole set in the list's order. A list of registered
apps opens synchronously, inside the call, as it did. Settings' later
`loadMarketplace` calls never reach it, and StrictMode's second run finds the
tab's marker.

Settings → Startup reads the registry on every render and subscribes to its
version, so a Marketplace app in the list appears by name once the listing
is in; before, `byId` was computed once per mount.

**Checked:** `npm run typecheck`, `npm run lint` and `npm test -w
@imbatranim/core` pass (574 tests; seven new in `startup.test.ts`: the set
waits and opens in order with the last in front, a failed listing still
opens the built-ins, an app the listing never brings is skipped, a fully
registered list does not wait, a disabled Marketplace app is not waited for,
and a restored layout or a tab that already ran opens nothing after the
listing).

**Walked**, with Office `909c321` installed and the startup list
`terminal, office-docs`:

- Before this brief, a new tab opened Terminal only.
- After: a new tab opened Terminal, then Office's Docs in front. A reload of
  that tab brought the same two windows back from its layout and opened
  nothing new.
- With `/api/marketplace` answering 503 (a Playwright route), a new tab
  opened Terminal.
- With the listing held back 12 s, Settings opened from Start during the
  wait listed only Terminal under Startup and no startup window was open;
  once the listing arrived the pane listed Terminal and Docs, and Terminal
  and Docs opened.

While the set waits on a slow listing, a window the owner opens meanwhile can
end up under the startup windows when they arrive; the listing normally
takes a fraction of a second.
