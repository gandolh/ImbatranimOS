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

## Outcome (2026-11-03)

**Built in `1aa34ea` (version 1.132.0).**
1. Settings → Linux apps has a **Keyboard layout** select: English (US), the
   default, and Romanian (standard). There were no other Linux apps
   preferences, so it is a new server dotfile, `imbatranimos:linux-apps`
   (`keyboardLayout.ts`, persisted like appearance and startup through
   `prefsStorage`, the key added to `DOTFILE_KEYS`); an unknown id reads as
   US. Adding a layout is a row in three lists: the desktop's, the backend's
   check (`wayland-input.ts`) and the host's table.
2. The tab sends `keyboard_layout` when the socket opens and on every change;
   the backend drops any id it doesn't know. The host's table maps `us` to
   xkb `us` and `ro` to `ro` with the `std` variant (ș and ț with a comma
   below); `set_keyboard_layout` calls smithay's `set_xkb_config`, which
   builds the keymap and sends `wl_keyboard.keymap` to every client. An
   unknown id, or a keymap that doesn't build, leaves the keyboard as it was.
3. `keymap.ts` is untouched: the tab still sends physical evdev codes.

**Checked:**
- `cargo test` (13): every offered layout builds its keymap; Romanian types
  ș ț ă î â and Ș Ț Ă Î Â on the keys US has as `; ' [ ] \`, and US is unchanged
  there; the host decodes the message.
- Backend: `us` and `ro` pass, `de`, empty, `ro,us` and non-strings are
  dropped (28 wayland tests). Core: the preference round-trips through its
  dotfile, an unknown id reads as US, and the connection sends it on open and
  on change, once per change, and not after it stops (3).
- In the dev container, with the host rebuilt for Alpine and **foot** in place
  of Firefox's address bar (no Firefox there at the time; the keymap reaches
  every client the same way): Romanian typed `șțăîâȘȚĂÎÂ` into a running
  `cat`; US, chosen without restarting foot, typed `;'[]\:"{}|` into the same
  one.
- The desktop's own windows are untouched: they type in the browser's layout.
