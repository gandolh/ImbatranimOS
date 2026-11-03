---
title: Linux apps, what the first wave leaves out
created: 2026-10-23
status: open
tags: [linux-apps, wayland-host]
---

# Linux apps, what the first wave leaves out

Briefs 168 to 173 get Firefox running in an OS window, installable from a
pane, with a lifecycle and sleep. The owner left these out on purpose on
2026-10-23 ([decisions-linux-apps.md](../wiki/decisions-linux-apps.md)):

- **Sound.** Firefox video plays silently. A Linux app's audio has to reach the
  tab: an audio server in the container (PipeWire or PulseAudio), its mix
  encoded (Opus) and streamed over the signed-in WebSocket. One mixed stream or
  one per app is undecided. A second sound source reopens the mixer question in
  [real-os-gaps.md](../wiki/real-os-gaps.md).
- **Clipboard** between Linux apps and the desktop. The browser gives no
  readable clipboard without a gesture and a permission, so this needs its own
  design.
- **XWayland**, for apps that only speak X11. smithay supports it.
- **A keyboard layout setting.** The first wave is US only, so Romanian letters
  don't type in Linux apps.
- **HiDPI.** `wl_output` scale stays 1, so Linux windows look soft on screens
  whose `devicePixelRatio` is above 1.
- **The VPS.** Turn it on there once brief 171's numbers are in, and measure
  RAM against the box's roughly 2 GiB free.
- **A video codec**, if 171 shows lossless frames are too heavy for video.
- **Moving the Nix pin** to a newer release from the pane.

Found while building it (2026-11-03, briefs 01, 04-06 of the new numbering):

- **Video bandwidth.** Firefox playing a synthetic 480 px video cost 239 kB/s
  in lossless WebP at 28 frames/s; a real film would cost several times
  that. The codec item above is now measured, not guessed (04's table).
- **Window places after a reload.** Linux windows come back where a new
  window opens: the saved layout leaves them out.
- **The Terminal's background jobs** outlive their shell (BusyBox `sh`),
  against the decision; owner's call, in status.md.
- **Localized `.desktop` names and desktop actions** (New Window) aren't
  read; a CJK font isn't in the base profile.
- **The zoom-less windows** while a Linux window is open stay until a
  Chromium without the renderer crash is confirmed (04's outcome).
