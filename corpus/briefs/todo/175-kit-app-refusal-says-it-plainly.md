# Brief 175 — A kit app's refusal says it plainly, not as a crash

## Context

Promoted 2026-10-23 from the todo
[kit-app-refusal-and-same-ref-reinstall](../../todos/promoted/kit-app-refusal-and-same-ref-reinstall.md),
first half. Brief 176 takes the second.

`KitAppHost` ([`KitAppHost.tsx:42-44`](../../../apps/core/src/modules/marketplace/KitAppHost.tsx))
checks `protocolRefusal(app) ?? kitRefusal(app)` from
[`refusals.ts`](../../../apps/core/src/modules/marketplace/refusals.ts) and
throws the sentence during render. The window's `AppErrorBoundary`
([`AppErrorBoundary.tsx`](../../../apps/core/src/shared/components/window/AppErrorBoundary.tsx))
catches it as a crash: the window says "stopped working", a "<name> crashed"
toast appears, and a client-error log entry is sent. The useful sentence ("…
was built for shared kit 1, and this desktop has shared kit 2. It needs an
update built for kit 2.") shows only under "Show details". A refusal is not a
crash. Nothing broke; the app cannot run here, and the window should say so.

## Spec

1. When `protocolRefusal` or `kitRefusal` returns a sentence, `KitAppHost`
   renders an inline refusal panel in the window instead of throwing: the
   sentence as the body, a heading ("Can't open <name>"), and a button that
   opens Settings → Marketplace on that app's row (the deep link the pane
   already supports, if it has one; otherwise just the pane).
2. Nothing is leased, fetched or added to the page for a refused app, as now:
   the check stays first, before any hook that does work. Mind the hooks rule:
   an early return before `useSystem` and the other hooks breaks hook order, so
   split the host into a checking outer component and the existing inner one.
3. No toast and no client-error log for a refusal.
4. `NativeAppHost` and `SandboxedAppHost`: check whether either throws
   `protocolRefusal` the same way (brief 120's protocol refusal). If so, use
   the same panel there; if not, say so in the outcome.

## Must preserve

- Real failures still go through `AppErrorBoundary`: a module that fails to
  load, a module with no `App`, a server lease that fails, a throw inside the
  app.
- The refusal sentences in `refusals.ts` stay word for word; the Marketplace
  pane uses the same facts.

## Acceptance

- A kit app whose `sharedKit` differs from `SHARED_KIT_VERSION` opens a window
  showing the heading, the sentence and the button, with no toast and no
  client-error request.
- The same for an app whose `minSystemVersion` is above `PROTOCOL_VERSION`.
- A kit app whose module throws still shows the crash fallback and the toast.
- `KitAppHost.test.tsx` covers the three cases; `npm run lint`, `npm run
  typecheck` and `npm test -w @imbatranim/core` pass.

## Files you OWN

- `apps/core/src/modules/marketplace/KitAppHost.tsx`, `KitAppHost.test.tsx`
- A small refusal panel component in `apps/core/src/modules/marketplace/`
- `NativeAppHost.tsx` / `SandboxedAppHost.tsx` and their tests, only if step 4
  finds the same throw

## Files you must NOT touch

- `apps/core/src/shared/components/window/AppErrorBoundary.tsx` and
  `crashToastGuard.ts`.
- `apps/core/src/modules/marketplace/refusals.ts` (read it, don't change it).
- `apps/core/src/modules/settings/MarketplaceSettings.tsx` (brief 176).
