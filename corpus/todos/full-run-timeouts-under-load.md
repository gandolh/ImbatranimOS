---
title: The full npm test times out in other workspaces under load
created: 2026-10-28
status: open
tags: [tests, ci-less, flake]
---

# The full npm test times out in other workspaces under load

Brief 181 removed core's two load-dependent errors (the late notification
store import and the marketplace test's missing `put`), and a stray prefs
retry timer. Fifteen runs of `npx turbo test test:e2e --force` on
2026-10-28, with the machine's load average between 18 and 55 from other
builds, still failed in workspaces that brief did not own, each on a fixed
timeout:

- `@imbatranim/markdown-editor`, `@imbatranim/notepad` and
  `@imbatranim/code-editor`: the first of brief 155's "a save over a file that
  changed on disk" tests exceeds vitest's 5 s, then the rest of that block
  fails with "'set value' called on an object that is not a valid instance of
  HTMLTextAreaElement" (the next test runs against the torn-down one).
- `@imbatranim/sheets`: `fidelity.test.ts` ("reports nothing for a workbook
  the bridge can carry whole"), 5 s.
- `backend`: `test/marketplace.e2e-spec.ts` ("runs a service app's server
  behind the session"), 60 s, which installs and builds a fixture app; and
  once `marketplace-servers.spec.ts` ("restarts a crashed server", which waits
  a fixed 2.5 s).

Each passes alone. The choices are longer timeouts on those tests, fewer
workers under turbo (`--concurrency`), or waiting on a condition instead of a
fixed sleep where there is one.
