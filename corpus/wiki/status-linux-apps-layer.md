---
summary: The first Linux apps layer (briefs 01-06) as built, 2026-11-03 - Nix in the image with Firefox, the Wayland host, input and title bars, popups, the Linux apps pane, lifecycle and sleep - moved unchanged out of status.md to keep it under its line cap. Branch, sizes and what each brief proved.
updated: 2026-11-06
---

> Moved here unchanged from [status.md](status.md) on 2026-11-06.

01-06, the Linux apps layer, are done: Nix in the image with Firefox
headless, the Wayland host showing a window, input and title bars, popups and
Firefox in a window, the Linux apps pane, lifecycle and sleep
([decisions-linux-apps.md](decisions-linux-apps.md)). Their branch is
`claude/linux-apps-layer` (2026-11-02, PR 1). 01 is done (2026-11-03): proven
in the prod image and the dev container, pinned at
`nixos-26.05.13446.7dcdd87373d7` (`7dcdd873`). The image is self-contained
(base profile and package index baked in; boot never downloads) and grows
from 393 MB to 488 MB; Firefox is a 446 MiB download and 1.4 GiB in `/nix`.
Nix state lives in `/nix`, not the home, so backups keep restoring. 02 is
done: the Wayland host shows a Linux app's window in an OS window, one
socket per tab, frames as lossless WebP. 03 is done: pointer, US keyboard,
focus, resize and close, and title bars that follow the app (the Win7 bar on
request, else a frame). Both were walked again in the dev container on
2026-11-03 with foot and gtk3-demo, 19 checks passing. 04 is done: popups
and subsurfaces, and Firefox in an OS window, walked in the dev container
(menus, tabs, a download, a video; PSS about 500 MB idle, 160 kB/s
scrolling). While a Linux window is open, windows open with the fade only:
Chromium's renderer crashed when a zoom ran beside one. 05 is done:
Settings → Linux apps searches the release's list (streamed into a 12 MB
index), installs and removes from the tab that holds the session, and frees
space; installed apps appear in Start and launch into the tab. 06 is done:
an app lives with its tab (a reload within 30 s finds it, closing the tab
stops it), sleeps under the cover screen, and goes quiet when hidden or
minimized; tini is PID 1. The owner merged the branch into `main` on 2026-11-03 (PR 1, `0cba6ab`), and this repo's `main` merged it after the theme briefs. The
grill of 2026-11-03 settled what it left open
([decisions-linux-apps-built.md](decisions-linux-apps-built.md)).

49 (2026-11-06, `f8ec1e5`, 1.188.0, ready for deploy): a click on a Linux app's
notification runs its `default` action (`ActionInvoked`, then `NotificationClosed`
2) and raises the app's window when exactly one matches; the toast's × still
doesn't signal the app. Calls in
[decisions-linux-apps-input-files-look.md](decisions-linux-apps-input-files-look.md).
