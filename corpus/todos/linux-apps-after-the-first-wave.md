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
