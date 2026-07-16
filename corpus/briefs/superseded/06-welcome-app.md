> SUPERSEDED 2026-07-16: project pivoted from installable ISO distro to web-OS-in-a-container (see wiki/decisions.md "The pivot itself" + log.md). ISO-era spec kept for the record.

# Task 06 — Welcome app: QML first-boot tour + system status

## Context

The custom product touch (corpus/wiki/decisions.md): Qt Quick/QML
first-boot app, v1 scope = tour + system status check. Apps-picker and
look-settings explicitly deferred. QML skills compound from brief 03's
SDDM theme. Depends on 03 (visual language) and runs after install (05).

## Files you OWN

- `welcome/` (QML app: CMake or qmake project, C++ or minimal
  qml-runtime host)
- `steps/70-welcome.sh` (build/install it into the rootfs, autostart
  entry)

## Files you must NOT touch

- Calamares configs (05), theme assets (03) — consume, don't edit

## What to do

1. QML app, ImbatranimOS B&W+accent styling, ~700x500 window:
   - Tour: 3 screens — what ImbatranimOS is; where things are (start
     menu, Discover, settings); where to get help (repo link).
   - Status page: update state (apt periodic stamp / notifier state),
     free disk space, missing-driver hint (`ubuntu-drivers devices`
     output, shown read-only).
2. Autostart on first login of an installed system (XDG autostart +
   "don't show again" checkbox writing a user config flag). NOT shown in
   the live session (casper user excluded).
3. Keep dependencies to Qt6 QML modules already in the image (declarative,
   controls); no Python, no webengine.

## Acceptance

First login after install shows the Welcome app themed like the OS; tour
pages navigate; status page shows real disk/update/driver data; ticking
"don't show again" + relogin → doesn't appear; live session never shows
it.
