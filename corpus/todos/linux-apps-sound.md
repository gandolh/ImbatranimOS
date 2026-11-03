---
title: Linux apps' sound reaches the tab
created: 2026-11-03
status: open
tags: [linux-apps, wayland-host, grill-first]
---

# Linux apps' sound reaches the tab

Split from the first wave's leftovers on 2026-11-03; needs a grill with the
owner before a brief. Firefox video plays silently. A Linux app's audio has to reach the
tab: an audio server in the container (PipeWire or PulseAudio), its mix
encoded (Opus) and streamed over the signed-in WebSocket.

Open for the grill:

- One mixed stream, or one per app.
- A second sound source reopens the mixer question in
  [real-os-gaps.md](../wiki/real-os-gaps.md).
