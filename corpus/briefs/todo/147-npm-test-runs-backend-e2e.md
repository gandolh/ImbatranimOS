# Brief 147 — `npm test` runs the backend e2e suite

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · ROOT and
BACKEND config (`turbo.json`, root `package.json`, `apps/backend/package.json`,
`README.md`). Independent. Implement inline.

## Context

`apps/backend/package.json` has `"test": "jest"` (unit tests,
`src/**/*.spec.ts`) and a separate `"test:e2e": "jest --config
./test/jest-e2e.json"`. `turbo.json` defines only a `test` task, and the root
`npm test` is `turbo test`. So the obvious command runs the 403 backend unit
tests and **never the 116 e2e tests** — the only suites that drive the real
global guard over HTTP, and the only kind of test that would have caught brief
137's missing `/api/me`. The project has no CI by decision (`corpus/routing.md`),
which makes the default command the only gate there is. Measured 2026-09-26:
e2e is 10 suites / 116 tests, all green, and runs in seconds on this host.

## Files you OWN

- `turbo.json`, root `package.json` scripts, `apps/backend/package.json`
  scripts, and the command list under "Developing" in `README.md`

## What to do

Either (a) add a turbo `test:e2e` task (no outputs) and make the root script
`"test": "turbo test test:e2e"`, or (b) make the backend's
`"test": "jest && jest --config ./test/jest-e2e.json"`. Recommended: (a) —
turbo caches the two separately, and a unit-only run stays available as
`turbo test`. Update the README line `npm run test  # backend test suite`,
which also undersells the ~1,450 frontend tests the same command runs.

## Acceptance

- A clean `npm test` at the root reports the backend e2e result (10 suites /
  116 tests at the time of writing) alongside the unit and frontend suites.
- A deliberately broken e2e assertion makes `npm test` exit non-zero (revert it
  afterwards).
