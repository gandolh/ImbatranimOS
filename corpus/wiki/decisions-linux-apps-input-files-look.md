---
summary: Linux apps calls made while building briefs 45-47 (2026-11-06) - the host speaks text-input-v3 itself and the phone's hidden input focuses on tap, launchers carry file types and launch takes a home-jailed file, shared-mime-info joins the image, and the backend serves the Settings portal as a second bus service.
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
