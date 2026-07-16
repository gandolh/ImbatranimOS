> SUPERSEDED 2026-07-16: project pivoted from installable ISO distro to web-OS-in-a-container (see wiki/decisions.md "The pivot itself" + log.md). ISO-era spec kept for the record.

# Task 02 — Desktop experience: Windows-7-classic layout + behaviors

## Context

Turn the stock LXQt from brief 01 into the ImbatranimOS desktop UX. Locked
decisions (corpus/wiki/decisions.md): Windows 7 / classic layout — left
start button + compact menu, left-aligned taskbar, tray + clock
bottom-right; desktop icons on; Win key opens the menu; Windows shortcuts.
Visual *style* (colors/theme) is brief 03 — this brief is layout and
behavior only. Depends on brief 01.

## Files you OWN

- `config/rootfs/etc/skel/.config/lxqt/panel.conf` (and sibling LXQt
  config files: session.conf, lxqt.conf, globalkeyshortcuts.conf)
- `config/rootfs/etc/skel/.config/openbox/rc.xml` (or lxqt-rc.xml)
- `config/rootfs/etc/skel/.config/pcmanfm-qt/` (desktop icons: Computer,
  Home, Trash; desktop prefs)
- `steps/30-desktop-config.sh` (applies the overlay, sets defaults)

## Files you must NOT touch

- `build.c`, `docker/` (brief 01's contract)
- Theme/icon assets (brief 03)

## What to do

1. LXQt panel: bottom, main-menu plugin far left, quicklaunch, taskbar,
   tray + volume + network + battery + clock/date far right. Single flat
   config in /etc/skel so every new user gets it.
2. Openbox keybindings: Super alone → lxqt main menu (known LXQt trick —
   bind via globalkeyshortcuts or xcape-style helper if needed),
   Win+E → pcmanfm-qt, Win+D → show desktop, Win+L → lock (lxqt-leave),
   Alt+Tab switcher on.
3. Desktop icons on via pcmanfm-qt --desktop in the LXQt session (default
   in LXQt session settings; verify it's enabled).
4. Default apps registered (xdg-mime): Firefox for http(s)/html, VLC for
   audio/video, LXImage-Qt for images, FeatherPad for text.
5. Live session (casper user) shows the same layout as an installed user.

## Acceptance

Boot the ISO: desktop shows icons, bottom panel with start button left and
clock right; Win key opens the menu; Win+E/Win+D/Win+L/Alt+Tab work;
double-clicking a video opens VLC. A new user created post-install gets
the identical layout.
