---
title: A button in a window that opens another app leaves that app behind
created: 2026-10-27
status: open
tags: [core, shell, windows]
---

# A button in a window that opens another app leaves that app behind

Found in brief 175's walk on 2026-10-27. `Window.tsx` raises its window on any
click inside it (`onClick` on the window root calls `focusWindow`). A button
inside the window that opens or raises another app runs first, then its click
bubbles to the root, and the window it sits in comes back to the front over
the app it just opened.

Seen in Chrome: Settings → Marketplace → **Open** on an app that was already
open raised that app, and Settings then covered it again (z-order 19, then
20). Brief 175's refusal panel stops its own click to avoid this; the pane's
**Open** buttons and any app that calls `system.openApp` from a click are
still affected.

A fix belongs in one place rather than in every button: for example, the
window root raising itself only when the click did not already bring another
window to the front.
