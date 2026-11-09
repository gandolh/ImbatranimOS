---
summary: Linux apps calls made while building briefs 45-49 (2026-11-06) - cursor images and the X11 clipboard bridge (48), a notification click via a source and an activation registry (49), the host speaks text-input-v3 itself and the phone's hidden input focuses on tap, launchers carry file types and launch takes a home-jailed file, shared-mime-info joins the image, and the backend serves the Settings portal as a second bus service.
updated: 2026-11-06
---

# Decisions: Linux apps' input, files and look (2026-11-06)

Made while building briefs 45, 46 and 47; their outcomes in
`corpus/briefs/done/` have the evidence. The earlier calls are in
[decisions-linux-apps-built.md](decisions-linux-apps-built.md). Changing one
needs an explicit revisit and a `log.md` entry.

## The host speaks text-input-v3 itself; touch only, focus on tap
_2026-11-06_ — Brief 45 gives the phone's keyboard a way into a Linux app.
The Wayland host handles `zwp_text_input_v3` in its own `session/text_input.rs`
and sends the tab a `text_input` frame (protocol 8); the tab keeps a hidden
input that Android's keyboard types into and sends `text_edit` back. It is for
touch only: a hardware key with a physical code still goes as a key. The hidden
input takes focus on a tap and releases after 1 s ("on-tap", the default);
`localStorage` `imbatranim.linuxTouchFocus = 'after-enable'` waits for the app
to enable a field instead.
Rejected: smithay's text-input relay (it needs an input-method-v2 client, and
nothing here is one).
**Why**: Android raises its keyboard only for an editable element, and a tap
that waits for the app can be too late for the browser's gesture rule, so
"on-tap" is the default until the owner's phone says which works (open).

## Linux apps open files: launchers carry types, launch takes a home-jailed file
_2026-11-06_ — Brief 46. A launcher lists the file types it opens, from the
desktop entry's `MimeType` and the profile's `share/mime/globs2`, only when
its Exec takes a file; the backend matches. `launch` accepts a path under the
home, resolved with `realpath`, and every refusal is the same 404. An
uninstalled saved default falls back; a Linux app never opens on a
double-click by itself.
**Why**: Open with offers only what can open the file, and a launch that takes
a path must not become a way to read outside the home.
- *Consequence*: a root `notes` outside the home, or `FILES_ROOT=/`, is refused (it fails closed).

## `shared-mime-info` is in the image
_2026-11-06_ — Owner's call on brief 46: Alpine's `shared-mime-info` joins the
image (prod and dev stages) as the file-type list, because LibreOffice's Nix
install brings no `share/mime/globs2`, and the launchers' `opens` needs one.
Rejected: installing it into the Nix profile (it would be one more thing the
clean-up or an Update could remove), and a manual step.
**Why**: the file-type list is infrastructure like the session bus, small and
needed before any app is installed.

## A second bus service: the Settings portal
_2026-11-06_ — Brief 47. Beside Notifications, the backend answers
`org.freedesktop.portal.Desktop` on each session bus (`linux-apps/dbus/settings.ts`),
serving only `org.freedesktop.appearance`: `color-scheme` and `accent-color`
(the current mode's strong colour), emitting `SettingChanged` when prefs
change. Unknown keys answer NotFound, as the real portal does.
**Why**: libadwaita apps and Firefox follow the desktop through that portal,
with no per-app theme file; the client from the 2026-11-05 call already
speaks D-Bus.
- *Consequence*: GTK3 and Qt are not covered; prefs have no per-user scope, so every session bus is told.

## Cursor images: a PNG and a hotspot on the existing message
_2026-11-06_ — Brief 48. A cursor surface goes to the tab as a small PNG with
its hotspot and scale, inside the existing `cursor` message (protocol 9), not a
new message. Over 128 px falls back to `default`. It is sent only when it
changes, kept per session so a reload's resync resends it, and the tab shows it
as `url(...)` with `image-set` at 2x.
**Why**: every X11 app and GTK 3 apps that draw their own cursors set a surface,
so names alone showed xterm's I-beam as an arrow; one message keeps the tab's
cursor handling in one place.
- *Consequence*: a scale above 2 clamps to 2; animated cursors resend the PNG
  per commit with no rate limit; X areas with no cursor show X's `left_ptr`.

## The X11 clipboard bridge: CLIPBOARD text only, the host waits for the owner
_2026-11-06_ — Brief 48. X11 CLIPBOARD text and the session's selection copy
both ways, as plain text like brief 41. PRIMARY stays in X; images and rich
text stay out. The host's selection has two kinds (the tab's text, an X11 source),
and after offering the tab's text it does a round trip to X so the CLIPBOARD
owner is confirmed before any paste. The owner's walk accepted the paste limit
below.
**Why**: smithay's `new_selection` only queues the ownership request; without the
wait, xterm pasted stale or empty text. PRIMARY would make every selection a
clipboard change.
- *Consequence*: if the X11 app that copied quits, a Wayland paste gets nothing
  (as in Wayland); a clipboard manager re-owning CLIPBOARD adds one hop. A paste
  over 64 KiB into xterm stalled (smithay's INCR watched top-level windows only),
  accepted on 2026-11-06 and fixed on 2026-11-09 by a vendored smithay patch
  ([brief 83](../briefs/done/83-x11-pastes-over-64-kib-reach-child-windows.md)).

## A notification click: a `source` and an activation registry, `default` only
_2026-11-06_ — Brief 49. A notification can carry `source` (a Linux app's id),
and a small activation registry in the shared notification code runs the click
for it; use this pattern for any click that isn't "open appId". Only the
`default` action is wired, with no action buttons. The tab raises the window
by matching the bus `app_name` (lowercased) to `linux:<id>`, and only when
exactly one such window exists.
**Why**: the click lived in the shared `ToastHost` and store, so the Linux
path hooks in there rather than forking the toast. Buttons ("Reply",
"Snooze") would break the desktop-like look; `app_name` is all the bus gives.
- *Consequence*: an `app_name` that isn't the app id raises nothing, and an app
  can name another's window (the user's own click); stale history rows with a
  `source` look clickable and do nothing; the toast's × doesn't signal the app.
