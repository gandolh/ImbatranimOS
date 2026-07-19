# Brief 48 — The protocol seam: `@imbatranim/ui` split + injected `system` handle

Status: **todo** · From the 2026-07-19 OS-layering grilling
(the (b)/(c)/(d) drivers). CORE + all add-ons, frontend. **≥3 independent chunks
→ `plan-split-dispatch` candidate.** Depends on nothing, but ship **brief 47
first** (error boundaries are the cheap (c) win). Design:
[wiki/os-layering.md](../../wiki/os-layering.md#the-seam--an-injected-system-capability-handle).

## Problem

Apps weld themselves to core's in-process internals via `import { … } from
'@imbatranim/core'` (109 import sites). This is a compile-time binding: there is
no seam, so the (d) "feels like one React app" reality holds and the (c)/future
isolation path is blocked — you can't `import` a function across an iframe
boundary. The grilled fix: define the app↔OS **protocol** now as an **injected
`system` capability handle**, backed by the cheap in-process transport today, so
the transport can later swap to sandboxed-iframe postMessage **without rewriting
apps**.

## Decisions (grilled 2026-07-19)

- **Mechanism = injected handle (B), not narrowed imports.** The compositor
  passes each app a `system` object at mount; apps import **nothing** from core.
  The `SystemHandle` TS interface **is** the versioned protocol spec.
- **Barrel bisection by "can it cross postMessage?"**
  - **Library (`@imbatranim/ui`, build-time import, NOT a capability):**
    `Button, Input, Checkbox, Dialog, Select, ScrollArea, Tooltip, ConfirmDialog,
    PromptDialog, cn` + pure-client hooks `useVirtualList, useSaveHotkey,
    useUnsavedGuard, createOpenedFileStore`.
  - **Capabilities (on `system`):** `system.fs`
    (`read/write/upload/download/fileName` — the file-bytes group), `system.http`
    (authed backend client `api`, **escape hatch** — an app's own routes, behind
    `SessionAuthGuard`, per-app restrictable later), `system.window` (app-facing
    `windowStore` subset: set title, request close, resize, focus, mark-dirty),
    `system.intents` (`openApp` + open-with + `useOpenIntent`), `system.notify`,
    `system.on(event)` for compositor→app events `focus/blur/visibilitychange/
    close-request`.
- **Migrate incrementally behind a compat shim** — no big-bang. Un-migrated apps
  keep working while the barrel still re-exports capability shims that delegate to
  the handle impl.
- **Prove on one app first:** sticky-notes (small, representative), then
  file-manager (heaviest: fs + intents + window) as the stress test. If the
  protocol survives file-manager, it survives everything.
- **Enforce with eslint at the end:** forbid capability imports from
  `@imbatranim/core`; only `@imbatranim/ui` + the injected `system` allowed.
- **Not in scope:** iframe/worker transport (gated on third-party apps), the
  raw-surface/WebGPU primitive (parked), a package/manifest install lifecycle
  (`manifest.ts` stays the registration point), any backend change (the syscall
  API is unchanged — `system.fs`/`system.http` wrap the *existing* endpoints).

## Fix (chunks — independently dispatchable)

1. **Extract `@imbatranim/ui`.** New workspace package; move the ~70
   component/hook exports out of core's barrel into it; core re-exports from
   `@imbatranim/ui` temporarily (compat) or apps re-point directly. Mechanical,
   no behavior change. Verify build/typecheck green before proceeding.
2. **Define `SystemHandle`.** New `apps/core/src/system/SystemHandle.ts` — the
   versioned interface (`fs`, `http`, `window`, `intents`, `notify`, `on`) with a
   `PROTOCOL_VERSION`. This file is the protocol spec; treat additions as API
   decisions.
3. **In-process implementation + `SystemProvider`.** Implement the handle over
   the existing stores/libs (`fileBytes`, `windowStore`, `intentStore`,
   `notificationStore`, `axios` `api`); wire a per-app instance (scoped to the
   window id, so `system.window.*` targets the app's own window) and inject it at
   the app mount point in the window renderer via a React context +
   `useSystem()` hook.
4. **Compat shim.** Keep the old capability exports on `@imbatranim/core`
   delegating to the handle impl, so un-migrated apps build and run unchanged.
5. **Migrate sticky-notes** to `useSystem()` — remove its capability imports;
   validate the full surface it touches. Then **migrate file-manager** (fs +
   intents + window stress test); fix any protocol gaps found *in the interface*,
   not with per-app escape hatches.
6. **Migrate the remaining apps** one at a time (each is small); drop capability
   imports as each is done.
7. **Flip eslint + remove the shim.** `no-restricted-imports`: capabilities from
   `@imbatranim/core` are forbidden in add-ons (only `@imbatranim/ui` + injected
   `system`); delete the compat shim once all apps are migrated.

## Must preserve (regression surface)

- Every app behaves identically after migration — same FS ops, same window
  behavior, same intents/open-with, same notifications.
- `system.window.*` acts on the **calling app's own window** (per-window scoping),
  never a global stomp.
- `manifest.ts` stays the only add-on import site in core; the add-on↔backend seam
  is still the HTTP API (no backend change).
- Error boundaries (brief 47) remain intact around each migrated app.
- The barrel split doesn't grow the desktop boot bundle (UI kit was already
  imported; lazy-load boundaries from brief 33 preserved).

## Verify bar

Per chunk: `turbo typecheck`, lint + format, `turbo build` green. After the two
proof apps: they run with **zero** `@imbatranim/core` capability imports. Final:
eslint rule active, compat shim deleted, all 23 apps migrated, full suite green.
**Human-gated:** open each app from Start, exercise its core action (edit a
sticky, browse + open a file, etc.), confirm no regression; confirm two tabs no
longer stomp each other's window layout (the (b) fix — note: the ephemeral-session
half is its own follow-up if not folded in here).
