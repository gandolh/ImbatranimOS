---
title: Core's tests flake under the full test run
created: 2026-10-27
status: promoted
tags: [core, tests]
---

<!-- Promoted 2026-10-28 → brief 181, with the owner's answer of 2026-10-27. -->

# Core's tests flake under the full test run

Found while closing briefs 174 to 176 on 2026-10-27. `npm test -w
@imbatranim/core` passes on its own, but under the full `npm test` (turbo runs
every workspace's tests at once) the core task fails with errors that depend on
load, not on what changed:

- **`prefs.ts` imports the notification store without waiting.** Line 173 does
  `void import('../shared/store/notificationStore').then(…)`. When a test file
  ends first, Vitest tears the environment down and the late import throws an
  `EnvironmentTeardownError`, an unhandled rejection that fails the run. Seen
  against `src/lib/prefs.test.ts`.
- **The same module, other files.** At `0d496f8` the run also reported an
  uncaught `api.put is not a function` from `prefs.ts`'s debounced
  `flushPrefs` timer, while `src/shared/registry/marketplace.test.tsx` was
  running: that file's axios mock has no `put`, and the timer fired after
  something in it wrote a pref.
- **A slow matcher.** `SandboxedAppHost.test.tsx` compared an iframe inside
  `toMatchObject`, which walks the element's React fiber; under load it took
  14.6 s and timed out. Brief 175 changed that test to compare the frame by
  identity.

Either the tests should wait for or stub the prefs write, or `prefs.ts`
should import the store statically.
