# Brief 181 — prefs.ts imports the notification store statically

## Context

From the todo
[core-tests-flake-under-the-full-run](../../todos/core-tests-flake-under-the-full-run.md).
The owner chose the fix on 2026-10-27: **a static import in `prefs.ts`**,
provided it does not create an import cycle; check that first.

`npm test -w @imbatranim/core` passes alone, but under the full `npm test`
(turbo runs every workspace at once) core fails on load-dependent errors.
The main one: `reportSaveFailure` in
[`prefs.ts`](../../../apps/core/src/lib/prefs.ts) (around `:172`) does
`void import('../shared/store/notificationStore').then(…)`. When a test file
finishes first, Vitest tears the environment down, the late import throws an
`EnvironmentTeardownError`, and the unhandled rejection fails the run. Its
comment says the import is lazy on purpose ("without importing the store
eagerly"); find out why before changing it.

A second error comes from the same module: at `0d496f8` the run reported an
uncaught `api.put is not a function` from `prefs.ts`'s debounced `flushPrefs`
timer while `src/shared/registry/marketplace.test.tsx` ran. That file's axios
mock has no `put`, and the timer fired after something in it wrote a pref.

## Spec

1. Check whether `notificationStore` (or anything it imports) imports
   `prefs.ts`. If there is no cycle, import the store at the top of `prefs.ts`
   and call it directly. If there is one, stop and write down the cycle in the
   outcome; the owner picks again.
2. Give `marketplace.test.tsx`'s axios mock a `put`, or flush or cancel the
   prefs timer in that file's cleanup, whichever is smaller.
3. Run the full `npm test` three times and record each result.

## Must preserve

- A refused save still shows "Couldn't save your settings" once.
- The core bundle's eager chunk does not grow by more than the store already
  costs it; say what it was before and after.

## Acceptance

- `npm test` (the whole repo) passes three runs in a row with no
  `EnvironmentTeardownError` and no `api.put` error.
- `npm run typecheck`, `npm run lint` pass.

## Files you OWN

- `apps/core/src/lib/prefs.ts` and `prefs.test.ts`
- `apps/core/src/shared/registry/marketplace.test.tsx` (the mock or cleanup only)
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/store/*`: briefs 164–167 and 169 own it. Importing it
  is fine; editing it is not.
