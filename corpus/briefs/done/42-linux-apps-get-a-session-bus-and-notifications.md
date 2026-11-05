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

## Outcome (2026-11-05)

Done in `9a46223` (1.147.0).

1. **A bus per session.** `SessionBusService` (linux-apps) starts
   `dbus-daemon --session --address=unix:path=$XDG_RUNTIME_DIR/imbatranim-bus/<session>`
   when the gateway reports a new session (a new `SessionHooks.started`).
   It runs in its own process group, recorded in `SessionApps`, so the cover
   screen freezes it with the apps and the session's end stops it. A stale
   socket from a killed bus is removed first; an image with no `dbus-daemon`
   logs once and runs apps without a bus, as before. `terminalEnv` gives
   every app from Start and the Terminal `DBUS_SESSION_BUS_ADDRESS`.
2. **Where dbus-daemon comes from** (the owner's call): Alpine's `dbus` in
   the prod and dev stages, about 0.7 MB, with
   `/usr/libexec/dbus-daemon-launch-helper` (setuid root) deleted. Nix's
   `dbus` closure is 80 MiB (systemd-minimal, glibc); Firefox's install
   already brings it into the store, but nothing roots it there.
   Recorded in [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).
3. **Notifications.** The backend's own D-Bus client (the owner's call over
   `@homebridge/dbus-native`): `dbus/wire.ts` (every marshalling type, the
   header, framing), `dbus/connection.ts` (EXTERNAL auth, Hello, calls,
   replies, signals) and `dbus/notifications.ts`, which owns
   `org.freedesktop.Notifications` and answers `Notify`,
   `CloseNotification`, `GetCapabilities`, `GetServerInformation`,
   `Introspect` and `Ping`. The tab shows each as an OS notification titled
   "<app>: <summary>" (`linux-windows/linuxNotifications.ts`); a replacement
   keeps its id; the app closing one takes it off; the owner removing it
   from the notification centre sends `NotificationClosed(id, 2)`.
4. **`actions` is advertised but not invoked.** Firefox sends a web
   notification to the server only when it lists `actions` (the click is a
   `default` action); with `body` alone it said nothing on the bus. Clicking
   a Linux app's notification does nothing yet: todo
   `linux-notification-click-runs-its-action`.

**Checked:**
- Unit tests: the wire format (alignment by hand-checked bytes, every
  type round-tripped, framing, refusals; 9) and the service (7). An
  integration test against a real `dbus-daemon` with GLib's `gdbus`
  calling `GetServerInformation`, `GetCapabilities`, `Notify` (with an
  `image-data` hint) and `CloseNotification`, and the `NotificationClosed`
  signal heard on a second connection; it skips where either tool is
  missing (it ran here). `terminalEnv`'s bus address; the tab's
  notification bridge (5). Backend and core typecheck and lint.
- **Walked in the dev container** (the kept one; `dbus` added inside it,
  the source copied in): the session's `dbus-daemon` runs in its own group
  in a 0700 directory, and the backend owns the name. With Firefox running,
  Start's New Window opened a second window of the same Firefox in 0.5 s
  (one Firefox process, the bus showed `OpenURL` to it), and
  `firefox --new-tab <url>` from another process opened the tab in the
  running one. A test page's `new Notification(...)` showed as "Firefox:
  Hello from a page" in the OS, and clearing it sent
  `NotificationClosed 1 2` (seen with `dbus-monitor`).
- Not checked: the cover screen freezing the bus (the same group path as
  the apps), and the image size after a rebuild (the dev image wasn't
  rebuilt; Alpine's package is 0.7 MB).
