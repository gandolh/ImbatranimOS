# Brief 46 — Add-on manager (enable/disable bundled apps)

Status: **todo** · Promotes [addon-manager](../../todos/addon-manager.md). Wave E.
CORE, frontend-only. New store + a single registry filter point + a Settings
section. (Doing this before 45 so the launcher-filter helper exists.)

## Problem

All 22 add-ons always show in Start / palette / desktop. A user can't hide apps
they don't want. Pairs with brief 33 lazy-load — a disabled app costs nothing
(its chunk never loads).

## Decisions (grilled 2026-07-18)

- **A persisted per-user disabled-set**, not a rebuild: `zustand` `persist`
  (`imbatranimos:addons`) holding `disabled: string[]` (app ids). Default: none
  disabled.
- **Filter in ONE place.** Add `apps/core/src/shared/registry/enabledApps.ts`
  exposing `useEnabledApps()` (reactive) + `getEnabledApps()` (non-reactive) that
  return `APP_REGISTRY` minus disabled ids. **Launchers** consume it (Start menu,
  command palette `appsSource`, Desktop icons). **Runtime** consumers keep the
  full `APP_REGISTRY` (Taskbar running-window buttons, `WindowContainer` render,
  so an already-open window still renders/closes even if its app was just
  disabled).
- **`openApp` guards new opens**: opening a disabled (disableable) app is a no-op,
  so file routing / commands can't launch a hidden app. Rendering an existing
  window is unaffected.
- **Non-disableable core apps**: `settings`, `file-manager`, `terminal`
  (`NON_DISABLEABLE` set) — always enabled, their toggles shown but locked, so a
  user can't lock themselves out of the shell / their files / a terminal.
- **UI = a Settings section** ("Apps"), not a separate app — avoids the
  meta-problem of disabling the manager itself. Lists every app with an
  enable/disable `Checkbox`; non-disableable ones disabled+checked with a hint.

## Fix

1. `shared/store/addonStore.ts` — persisted `{ disabled }` + `toggle/enable/
   disable`, `isDisabled(id)`.
2. `shared/registry/enabledApps.ts` — `NON_DISABLEABLE`, `useEnabledApps()`,
   `getEnabledApps()` (filter APP_REGISTRY; always include non-disableable).
3. Launchers use it: `StartMenu` (app list), `Desktop` (icons — keep the existing
   `settings` filter), `appsSource` (`getEnabledApps()` via
   `useAddonStore.getState()`).
4. `openApp.ts` — early-return when the target id is disabled and not in
   `NON_DISABLEABLE`.
5. `Settings.tsx` — new "Apps" `SectionHeader` + a list of `APP_REGISTRY` with a
   toggle each; export nothing new from the barrel (internal).

## Must preserve (regression surface)

- An open window whose app was just disabled still renders + closes (runtime uses
  full registry). Re-opening it from Start is what's gated.
- Non-disableable apps can never be hidden (locked toggles + `openApp`/filter both
  honor `NON_DISABLEABLE`).
- No change to how apps are declared (manifest.ts untouched); the filter is
  purely a read-time view.

## Verify bar

`turbo typecheck`, core lint + format green, `turbo build` ok. **Human-gated:**
disable an app → it vanishes from Start/palette/desktop, its file-type (if any)
no longer auto-opens it; re-enable restores it; Settings/Files/Terminal can't be
disabled; state survives reload.

## Invariants

Lightweight (disabled apps' lazy chunks never load — brief 33 synergy). Identity
locked. Client-only (no backend/auth surface).

## Out of scope

Per-app permissions, reordering/pinning, uninstall (apps are bundled), install
from outside, disabling by category.

## Outcome (2026-07-18) — Wave E commit `3e72333`

Shipped, all in `apps/core/`. `shared/store/addonStore.ts` (zustand persist
`imbatranimos:addons`, `{ disabled: string[] }`, toggle/enable/disable/isDisabled)
+ `shared/registry/enabledApps.ts` (`NON_DISABLEABLE = {settings, file-manager,
terminal}`, `useEnabledApps()` reactive + `getEnabledApps()` non-reactive, shared
`filterEnabled`). Launchers filter through it — StartMenu, Desktop (keeps its
`settings` filter), palette `appsSource`; runtime consumers (Taskbar
running-windows, WindowContainer render) stay on the full `APP_REGISTRY`, so an
open window whose app was just disabled still renders + closes. `openApp` early-
returns `''` for a disabled disableable id. Settings gained an "Apps" section
(Checkbox per app; non-disableable rows checked+locked+"Required"). No new dep,
no manifest change (read-time view). Gates green (typecheck 23/23, lint, format,
build). Human-gated: disable→vanishes from launchers, re-enable restores, core
apps un-disableable, survives reload.
