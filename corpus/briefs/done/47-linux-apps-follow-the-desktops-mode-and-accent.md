# Brief 47 — Linux apps follow the desktop's mode and accent

## Context

On 2026-11-06 the owner asked whether the UI could reach the tab as a
description instead of pixels.
[research-remote-ui-rendering.md](../../wiki/research-remote-ui-rendering.md)
found no remote-UI option worth building and listed what the owner wanted as
cheaper inside today's pipeline: the phone keyboard (brief 45), sharp windows
(brief 33), and themes, which weren't briefed. The same day the owner closed
the research and asked for this brief.

Today a Linux app draws with its toolkit's own theme (Adwaita, Fusion) and
ignores the desktop's light or dark mode and accent. The freedesktop Settings
portal carries both: `org.freedesktop.appearance` has `color-scheme` (0 no
preference, 1 dark, 2 light), `accent-color` (an RGB triple of doubles from
0 to 1) and `contrast`
([spec](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html)).
libadwaita reads the first two and restyles live on `SettingChanged`
(`adw-settings-impl-portal.c`, per the research). Apps call it as
`org.freedesktop.portal.Settings` on the bus name
`org.freedesktop.portal.Desktop`, path `/org/freedesktop/portal/desktop`.

Each tab's session bus is Alpine's `dbus`, and the backend already answers
`org.freedesktop.Notifications` on it with a D-Bus client of its own
(`apps/backend/src/modules/linux-apps/dbus/`,
[decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md)).
The desktop's appearance is the `imbatranimos:appearance` dotfile
(`apps/core/src/shared/store/appearanceStore.ts`: theme Apricot or Classic,
mode light or dark, an accent preset), stored on the server by the prefs
module (`apps/backend/src/modules/prefs/prefs.service.ts`). Radii and fonts
have no portal setting and can't follow.

## Owner decisions

Settled on 2026-11-06: build it, mode and accent only. The smaller calls,
with the default this brief builds:

1. **Which colour is the accent.** Default: the current mode's `strong`
   colour of the chosen preset, the one the desktop uses for focus rings,
   borders and primary actions. libadwaita derives its own lighter and
   darker shades from it.
2. **Contrast.** Default: always 0 (no preference); the desktop has no
   high-contrast mode to follow.
3. **Live changes.** Default: yes. Switching mode or accent in Settings
   emits `SettingChanged` on every open session's bus, so open apps restyle
   without a restart.

## What to do

1. A Settings server beside the notifications one: it owns
   `org.freedesktop.portal.Desktop` on each session's bus, serves
   `/org/freedesktop/portal/desktop` with `org.freedesktop.portal.Settings`
   version 2 (`ReadAll`, `Read`, `ReadOne`, the `version` property) for the
   `org.freedesktop.appearance` namespace only, and answers any other
   namespace as empty, not as an error. Introspection like the
   notifications server's.
2. The values from the appearance dotfile of that session's user: mode to
   `color-scheme` (1 or 2), the accent to `accent-color` (decision 1),
   `contrast` 0. A dotfile with no appearance yet reads as Apricot's
   defaults, as the desktop does.
3. When the prefs module writes the appearance dotfile, emit
   `SettingChanged(namespace, key, value)` for each key that changed, on
   every session bus of that user.
4. Tests: the wire format of `ReadOne` and `ReadAll` replies (variant
   nesting), the mapping from each theme, mode and accent preset, an
   unknown namespace, and the signal on a change; the bus integration test
   reads the setting through a real `dbus-send` like the notifications one.
5. A walk in the dev container: a libadwaita app (GNOME Text Editor, or
   whatever libadwaita app is lightest at the pin) opens dark when the
   desktop is dark and takes the accent; switching to light in Settings
   restyles it live. Note what Firefox (its `prefers-color-scheme` on a
   test page), a GTK 3 app and a Qt app did, without fixing them here.
6. Corpus: the Linux apps feature table's "Look" row in
   [research-native-apps-via-wayland.md](../../wiki/research-native-apps-via-wayland.md),
   the Linux apps pages, status and log.

## Files you OWN

- `apps/backend/src/modules/linux-apps/dbus/` (a new `settings.ts` and its
  spec), `session-bus.service.ts` (starting it beside notifications),
  `apps/backend/src/modules/prefs/` (the change hook) and their tests
- the corpus pages in step 6, `corpus/log.md`

## Files you must NOT touch

- `apps/core/` beyond reading the appearance types: the dotfile's shape
  stays as it is.
- The Wayland host (`apps/wayland-host/`): this is D-Bus
  only.

## Acceptance

- The tests above pass; the full test run stays green.
- The walk: the libadwaita app follows dark and light, live, and takes the
  accent; Start, Files and the other kit apps are unchanged.
- **Owner check** after a deploy: the same on the VPS, with one libadwaita
  app installed from Settings → Linux apps.

## Outcome (2026-11-06)

Built in `6113d57` (1.176.0). Ready for deploy on the board.

1. **A second bus service, the Settings portal.** `linux-apps/dbus/settings.ts`
   owns `org.freedesktop.portal.Desktop` on each session bus (its own D-Bus
   connection), beside the Notifications service. It answers `ReadAll`,
   `ReadOne`, the deprecated `Read` and `version` 2, and only the namespace
   `org.freedesktop.appearance`: `color-scheme` 1 dark or 2 light, `accent-color`
   as the current mode's `strong` colour in doubles, `contrast` 0. No prefs
   dotfile means Apricot light.
2. **Live changes.** `PrefsService.onChange` calls `SessionBusService`'s
   `update()`, which emits `SettingChanged` only for keys that changed.
   `SessionBusService` gains `PrefsService` as its third constructor
   argument, and `LinuxAppsModule` imports `PrefsModule`. Prefs has no
   per-user scoping, so every open session bus gets the change.
3. **Decisions.** `ReadOne` and `Read` of an unknown key answer
   `org.freedesktop.portal.Error.NotFound`, as the real portal does; `ReadAll`
   of an unknown namespace answers empty. The accent table mirrors the core
   presets, and a spec parses `appearanceStore.ts` to catch drift.

**Checks run.** Backend jest 6 suites, 63 tests; tsc clean; the bus
integration spec ran against a real `dbus` with the Settings case. The
headless walk passed in full: GNOME Text Editor restyles live when the mode
flips; Firefox follows dark after a reload; xterm stays white (it reads no
portal). `gdbus ReadOne` gave color-scheme 2 (light) and an accent near
(0.63, 0.29, 0.14) for Apricot light. Installed in the dev profile for the
walk: gnome-text-editor 50.1 and shared-mime-info.

**Found at the verify gate.** Brief 40 (`d3da0e7`) exported `useSystemSound`
from the kit but missed the marketplace kit map, so core's `tsc` failed. Fixed
in its own commit `8b371ae` (1.174.0), before this wave's briefs.

**Skipped.** The walk covered libadwaita apps and Firefox; GTK3 and Qt apps
were not part of it.

**For the owner.** After the deploy, flip the mode and accent in Settings with
a libadwaita app open and watch it follow.
