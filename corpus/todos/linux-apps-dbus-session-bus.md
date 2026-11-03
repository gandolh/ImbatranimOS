---
title: Linux apps have no D-Bus session bus
created: 2026-11-03
status: open
tags: [linux-apps, wayland-host, grill-first]
---

# Linux apps have no D-Bus session bus

Found walking brief 35 (2026-11-03). A tab's Linux apps run with no D-Bus
session bus: no `DBUS_SESSION_BUS_ADDRESS`, and no `dbus-daemon` in the image
or the base profile. On Wayland, Firefox hands a second launch to the running
instance over D-Bus, so Firefox's desktop action New Window, chosen while
Firefox runs, starts a second process that finds the profile locked and shows
"Firefox is already running, but is not responding". With no Firefox running,
New Window opens Firefox as it should.

The same bus is how most desktop apps open a URL in the running browser, reach
the notification and file-chooser portals, and keep a single instance, so the
gap is wider than Firefox. Needs a grill before a brief:

- One bus per desktop session (the tab), started with it and stopped with
  it, as the session's apps are; `dbus-daemon` from the base profile or from
  Nix on first use (closure size against the image's).
- Which portals, if any, the desktop then answers (notifications into
  `system.notify`, the file chooser into the OS file dialog).
