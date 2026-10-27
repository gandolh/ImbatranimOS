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

## Outcome (2026-10-27)

**Built in `81de146` (version 1.34.0), walked in Chrome in the dev
container** with brief 163's kit fixture (`kit-repo.ts`) installed from a
`file://` descriptor copied into the container's catalog only. A window of an
app that cannot run here now shows `RefusalPanel`: "Can't open <name>", the
sentence from `refusals.ts` word for word, and **Open Settings**. Settings has
no deep link to a section or a row, so the button opens it at the top.

**Step 4: both other hosts threw the same way.** `NativeAppHost` threw
`protocolRefusal` during render; `SandboxedAppHost` threw its own copy of the
same sentence from inside its mint effect. All three hosts now check in an
outer component and render the existing host only when the app can run, so
nothing is leased, fetched, minted or linked for a refused app and the hosts'
hooks keep their order. `SandboxedAppHost` uses `protocolRefusal` now, and its
copy of the sentence is gone.

What the walk showed:

- Kit Notes installed with `sharedKit: 99`: its window showed the heading, the
  kit sentence and the button. No "stopped working", no "crashed" toast, no
  request to `/logs/client-error`, and the module and `kit.css` were never
  fetched.
- The same descriptor with `minSystemVersion: 99`: the same panel with the
  protocol sentence (checked before the kit one).
- **Open Settings** brought Settings up *behind* the refused window on the
  first try: the button's click bubbled to the window root, whose click raises
  its window. The panel now stops the click; walked again, Settings opened in
  front. The pane's own **Open** buttons have the same bubbling, which is in
  the todo
  [in-window-open-raises-the-clicked-window](../../todos/in-window-open-raises-the-clicked-window.md).

**Not walked:** a kit app whose module throws (covered by the test below), and
the protocol panel in a native or sandboxed window (covered by their tests).

**Tests:** `KitAppHost.test.tsx` covers the three cases: kit refusal and
protocol refusal (panel, no fallback, no toast, no request at all) and a
throwing `App` (fallback, "Kit Notes crashed" toast, one client-error post).
`RefusalPanel.test.tsx` checks that the button opens Settings and that the
click does not reach the window. The protocol tests in `NativeAppHost.test.tsx`
and `SandboxedAppHost.test.tsx` now expect the panel. One sandboxed test
compared the iframe inside `toMatchObject`, which walks the element's React
fiber; with the host split in two that took seven seconds and timed out, so it
compares the frame by identity now. Gates: `npm run typecheck` (32 tasks),
`npm run lint` (31 tasks, no errors), core tests 522/522.
