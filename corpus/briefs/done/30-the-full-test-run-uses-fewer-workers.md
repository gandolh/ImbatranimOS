# Brief 30 — The full test run uses fewer workers

## Context

On 2026-10-28, fifteen runs of `npx turbo test test:e2e --force` with the
machine's load average between 18 and 55 from other builds failed on fixed
timeouts in tests that pass alone:

- `@imbatranim/markdown-editor`, `@imbatranim/notepad` and
  `@imbatranim/code-editor`: the first "a save over a file that changed on
  disk" test exceeds vitest's 5 s, then the rest of that block fails against
  the torn-down editor;
- `@imbatranim/sheets`: `fidelity.test.ts` ("reports nothing for a workbook
  the bridge can carry whole"), 5 s;
- `backend`: `test/marketplace.e2e-spec.ts` ("runs a service app's server
  behind the session"), 60 s, and once `marketplace-servers.spec.ts`
  ("restarts a crashed server", which sleeps a fixed 2.5 s).

The owner chose on 2026-11-03 to cap turbo's workers for the full run.
Rejected: longer per-test timeouts plus polling instead of the fixed sleep.
The fixed sleep stays as it is. Promoted from the todo
`full-run-timeouts-under-load`.

## Spec

1. Add `--concurrency=50%` to the root `test` script in `package.json`
   (`turbo test test:e2e`), so turbo runs at most half as many tasks as the
   machine has cores. A percentage travels across machines; turbo's default
   is 10 tasks.
2. Say so in `docs/getting-started.md` (or wherever the full run is
   described), with how to override it for one run.

## Acceptance

- `npm test -- --dry=json` (or turbo's summary) shows the cap applied.
- One workspace's tests through turbo pass with the flag, for example
  `npx turbo test --filter=@imbatranim/notepad --concurrency=50%`.
- The full run is **not** part of this brief's checks: it is heavy, and
  whether the cap is enough under load is the owner's check on their next
  full run. The outcome says so.

## Files you OWN

- `package.json` (the `test` script)
- `docs/getting-started.md` (the line about the full run)

## Outcome (2026-11-03)

**Built in `7dee332` (version 1.123.0).** The root `test` script is
`turbo test test:e2e --concurrency=50%`. `getting-started.md`'s scripts
table says so and why, and how to run once without it: turbo refuses
`--concurrency` twice ("cannot be used multiple times"), so
`npm test -- --concurrency=…` fails, and the override is
`npx turbo test test:e2e --concurrency=100%`.

**Checked:**
- `npm test -- --dry=json` doesn't show it: turbo's dry-run JSON has no
  concurrency field, and its run summary's `command` omits the flag. So the
  cap was measured instead, from the run summary's task start and end times:
  `npm test` on six packages' tests with `--force` on this 4-core machine
  ran at most **2** tasks at once; the same run without the flag ran **6**.
- `npx turbo test --filter=@imbatranim/notepad --concurrency=50%` passes (45
  tests).
- Not run: the full run under load. Whether half the cores is enough is the
  owner's check on their next full run.
