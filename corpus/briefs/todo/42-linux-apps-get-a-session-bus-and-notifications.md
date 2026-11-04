# Brief 42 — Linux apps get a session bus, and their notifications reach the desktop

## Context

A tab's Linux apps run with no D-Bus session bus: no `DBUS_SESSION_BUS_ADDRESS`
and no `dbus-daemon` in the image or the base profile. On Wayland, Firefox hands
a second launch to the running instance over D-Bus, so New Window while Firefox
runs shows "Firefox is already running, but is not responding". Most desktop
apps open URLs in the running browser, keep a single instance and send
notifications over the same bus. Found walking brief 35 (2026-11-03).

Grilled with the owner on 2026-11-04: **a bus per session, plus
notifications**. Save and open dialogs stay the apps' own (no file-chooser
portal).

## Spec

1. Each tab's Linux session starts its own `dbus-daemon --session`, and every
   app in the session gets its address. It stops with the session, as the
   apps do, and sleeps with them under the idle cover screen.
2. Where `dbus-daemon` comes from: the base profile or Nix on first use,
   whichever costs less; record the closure size against the image's.
3. The OS answers `org.freedesktop.Notifications` on that bus: a Linux app's
   notification (a site's web notification in Firefox, for one) shows as an
   ordinary OS notification under the app's name, through the system notify
   path. Closing it in the OS tells the app it was closed.
4. Nothing else answers on the bus yet; apps that look for other services find
   none, as today.

## Must preserve

- One session per tab, and nothing shared between tabs' sessions.
- The shell user `imbatranim`, no root, no system bus.

## Acceptance

- In the dev container: with Firefox running, its New Window opens a second
  window of the same Firefox; a link opened from another Linux app opens in
  the running Firefox.
- A test page's `new Notification(...)` in Firefox shows an OS notification.
- Tests for the notification bridge pass.

## Files you OWN

- `apps/backend/src/modules/linux-apps/` (the bus per session, the
  notifications service)
- The base profile / Dockerfile lines for `dbus`
