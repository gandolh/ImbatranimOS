---
title: X11 apps share the clipboard and show their own cursors
created: 2026-11-05
status: open
tags: [linux-apps, x11]
---

# X11 apps share the clipboard and show their own cursors

Found building brief 31 (2026-11-05). X11 apps open through Xwayland, but
two things stop at Xwayland's edge:

- **The clipboard.** Copy and paste works between X11 apps (Xwayland keeps
  their selections), but not with Wayland apps, the rest of the OS or the
  computer the browser runs on. smithay's X11 window manager can bridge the
  X11 selections and the session's `wl_data_device` one (`XwmHandler`'s
  `new_selection` and `send_selection`, `X11Wm::new_selection` and
  `send_selection`), which brief 41's plain-text bridge with the tab would
  then carry. The session's selection handlers hold the tab's text as their
  user data today, so a source from X11 needs a second kind.
- **Cursors.** An X11 app's cursor reaches the host as a cursor surface, which
  the tab shows as the default arrow (xterm's I-beam among them). Wayland apps
  that name a cursor (cursor-shape-v1) show it; X11 apps would need the
  surface's image sent, or its X cursor name mapped.

Both are small next to brief 31; worth a short grill on whether the cursor
image is worth sending at all.
