---
title: An add-on's desktop layer has no error boundary
created: 2026-11-03
status: open
tags: [core, add-ons, robustness]
---

# An add-on's desktop layer has no error boundary

Found while building brief 24 (2026-11-03). Each window has its own error
boundary, so an app that throws shows "stopped working" in its window and the
desktop stays. A **desktop layer** (`desktopLayer` in the add-on contract;
today Sticky Notes' `DesktopNotes`) is mounted by `Desktop.tsx` with none: when
it throws, React unmounts the whole tree and the page goes black, as the tray
did. On a host run with `VITE_API_URL` unset, the tray and then the notes layer
each did exactly that, reading the page's HTML as their data.

Both were fixed at the read (brief 24). What's open: a boundary round each
desktop layer in `Desktop.tsx`, so a layer that throws draws nothing and the
desktop stays, the way a window's does. Brief 24 ruled out a boundary for the
tray itself; this is the add-on side, where core can't vet the code. Small
enough to promote as written.
