# Brief 29 — Pay down the backend type-safety lint debt

Status: **done** (2026-07-17) · Resolved the backend slice of
[lint-format-debt](../../todos/lint-format-debt.md).

## Outcome (2026-07-17)

`backend#lint` is now **green (0 errors, 0 warnings)** — root `npm run lint`
finally passes. Types-only, no behavior/SQL change. Fixed by typing the raw
better-sqlite3 sites + surrounding `any`: `main.ts` (dropped dead `Http*`
imports, typed `NestFactory.create<NestExpressApplication>`, `void
bootstrap()`), `pty.gateway.ts` (`getHttpServer()` cast to `HttpServer`),
`pty-session.ts` (+ `.spec`) member-access/`String(raw)` narrowing with one
justified disable, `files.controller.ts` (redundant regex escape), and the
e2e specs (`INestApplication<Server>` + response-body row interfaces).
`todos.service`/`system.service` were already clean. The two auth-lane
leftovers (`auth.guard.ts` config-get typing + its spec's `any` req) fell
between this brief and brief 28's lanes and were fixed by the orchestrator at
the combined verify. `bookmarks.service` was already done in the review
pass (CS-5). Gates: turbo typecheck 13/13, format 14/14, lint 13/13,
backend 80 unit + 34 e2e green.

## Problem

`backend#lint` is red — the only thing keeping root `npm run lint` from
green. The remaining errors are `@typescript-eslint/no-unsafe-*` across raw
better-sqlite3 call sites (repositories type query results as `any`) plus a
few dead imports. CS-5 already typed the bookmarks service in the review
pass; this finishes the job across the rest.

## Fix

Run `cd apps/backend && npm run lint` (eslint), read every remaining error,
and fix them by typing the data rather than suppressing:

- Give each raw `.get()` / `.all()` / `.run()` result a concrete row
  interface (mirror the CS-5 pattern in `bookmarks.service.ts`:
  `type XRow = {...}`, `.get(id) as XRow`, dynamic-update accumulators typed
  `Record<string, string | number | null>`). Cover `todos.service.ts`,
  `system.service.ts`, `notes.service.ts` (now just `getRecent`), and any
  other flagged repository.
- Drop dead imports the rule flags (e.g. leftover `Http*` in `main.ts`).
- Do NOT blanket-disable rules; a narrow, commented `eslint-disable-next-line`
  is acceptable ONLY where typing genuinely can't express the shape (justify
  it).

## Lane (this brief runs alongside brief 28)

Do **not** touch `apps/backend/src/modules/auth/**` or
`apps/backend/src/config/env.schema.ts` — brief 28 owns those concurrently.
They should already be lint-clean; if `backend#lint` still reports an error
in that lane, note it (do not edit) and it'll be reconciled at the combined
verify.

## Verify bar

`cd apps/backend && npm run lint` exits 0 (or only the excluded-lane items,
reported). `npx tsc --noEmit -p tsconfig.json` clean except the KNOWN
pre-existing `test/files.e2e-spec.ts` supertest `.parse` typing error.
`npx jest` + e2e green (typing changes must not alter behavior). Then update
[lint-format-debt](../../todos/lint-format-debt.md) to reflect green.

## Invariants

Behavior-preserving (types only). No SQL/logic changes. No new deps.
