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

## Built 2026-10-28; the full run is not green three times yet

**No cycle.** `notificationStore.ts` imports only `zustand` and
`zustand/middleware`, so nothing it loads reaches `prefs.ts`. Why the import
was lazy: the comment said "without importing the store eagerly", and
`prefs.ts` is in the first page load (`main.tsx` paints the appearance before
React). But the store was already in the entry chunk, beside the toast host,
so the dynamic import saved nothing.

**Built in `0937bba` (1.43.0)**, with a follow-up in `c5b1bd9` (1.51.0):

- `prefs.ts` imports the store at the top and `reportSaveFailure` calls it
  directly. A refused save still says "Couldn't save your settings" once
  (`prefs.test.ts`, new test).
- `marketplace.test.tsx`'s axios mock has a `put` (smaller than flushing the
  prefs timer in its cleanup).
- `c5b1bd9`: `prefs.test.ts` loads a fresh module per test, and the old
  modules' debounce and retry timers kept running; a 503 test's 5 s retry
  landed in a later test as an extra PUT under the full run. Each module a
  test loads is reset after it.
- The eager set (the entry script and every chunk `index.html`
  modulepreloads), from `vite build`: before, 37 files, 856,757 bytes raw,
  281,651 gzipped; after, 36 files, 856,239 and 281,117. The store moved from
  the entry chunk into the `openApp` chunk beside `prefs.ts`; nothing grew.

**The full `npm test`**, as `npx turbo test test:e2e --force` (without
`--force` turbo replays its cache and runs nothing), on a machine shared with
other agents' builds, load average between 18 and 55:

| Set | Runs | Result |
|---|---|---|
| before `c5b1bd9` | 12 | 2 green; failures in `@imbatranim/sheets` (`fidelity.test.ts`, 5 s timeout), `markdown-editor`, `notepad` and `code-editor` (brief 155's save-conflict tests, 5 s timeout then a cascade), `backend` e2e (`marketplace.e2e-spec.ts`, a service app's server, 60 s timeout), once core's `prefs.test.ts` (the stray retry, fixed in `c5b1bd9`) and once brief 182's own new test (fixed in `afa3d56`) |
| after `c5b1bd9` | 3, `--continue` | 1 green; the other two failed only `backend` e2e on the same 60 s timeout. Core 567/567 each time |

None of the fifteen runs showed an `EnvironmentTeardownError` or
`api.put is not a function`, the two errors this brief was for. The
acceptance asks for three green runs in a row, and that has not happened: what
still fails is other workspaces' fixed timeouts under load, outside this
brief's files. Recorded in
[full-run-timeouts-under-load](../../todos/full-run-timeouts-under-load.md).
`npm run typecheck` and `npm run lint` pass. **Owner:** close this as is, or
first fix those timeouts (the todo), then run the three again.

## Closed 2026-10-28 by the owner

The owner closed this brief as it stands on 2026-10-28. Its own two errors
(`EnvironmentTeardownError` and `api.put is not a function`) are gone. The
full run's remaining failures are other workspaces' fixed timeouts under load,
and they stay in
[full-run-timeouts-under-load](../../todos/full-run-timeouts-under-load.md).
