# Brief 32 — A keyboard layout for Linux apps

## Context

The first wave is US only (owner, 2026-10-23), so Romanian letters don't
type in Linux apps. `apps/core/src/modules/linux-windows/keymap.ts` maps
`KeyboardEvent.code` to evdev codes, so keys are physical, and the host's
US xkb keymap (from libxkbcommon) makes the characters. Split out of the
todo `linux-apps-after-the-first-wave` with the owner on 2026-11-03.

## Spec

1. Add a keyboard layout choice to Settings → Linux apps: US (the default)
   and Romanian (standard), with room for more. It is a preference, stored
   like the other Linux apps preferences.
2. The tab sends the layout to the host; the host compiles that xkb keymap
   and sends it to every client (`wl_keyboard.keymap`), at connect and when
   the setting changes, without restarting the apps.
3. Keys stay physical: the evdev mapping in `keymap.ts` doesn't change.

## Must preserve

- US typing and every shortcut as today.
- The desktop's own (non-Linux) windows are unaffected.

## Acceptance

- With Romanian chosen, typing `ș ț ă î â` (and their capitals) in
  Firefox's address bar gives those letters; switching back to US gives US
  characters without restarting Firefox.
- Tests: the setting round-trips, and the host builds both keymaps
  (`cargo test`).
- Typecheck, lint and the tests of the files changed pass.

## Files you OWN

- `apps/wayland-host/src/` (keymap and its message)
- `apps/wayland-host/PROTOCOL.md` (the new message)
- `apps/core/src/modules/settings/LinuxAppsSettings.tsx` (the choice)
- `apps/core/src/modules/linux-windows/` (sending it)
