---
title: A clipboard between Linux apps and the desktop
created: 2026-11-03
status: open
tags: [linux-apps, wayland-host, grill-first]
---

# A clipboard between Linux apps and the desktop

Split from the first wave's leftovers on 2026-11-03; needs a grill with the
owner before a brief. Copy and paste between a Linux app and the desktop's own
windows (and the browser's clipboard) doesn't work. The browser gives no
readable clipboard without a user gesture and a permission, so this needs its
own design: which direction is automatic, what a paste into a Linux app asks
for, and what the Wayland side (`wl_data_device`) does in between.
