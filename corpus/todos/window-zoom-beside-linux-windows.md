---
title: Bring the window zoom back beside Linux windows once a GPU Chrome is checked
created: 2026-11-03
status: open
tags: [linux-apps, owner]
---

# Bring the window zoom back beside Linux windows once a GPU Chrome is checked

Split from the first wave's leftovers on 2026-11-03. While any Linux window
is open, OS windows open and close with the fade alone
([decisions-linux-apps-built.md](../wiki/decisions-linux-apps-built.md), "No
zoom while a Linux window is open"), because Chromium's renderer crashed
beside a drawing Linux window in headless and full builds, with or without a
GPU flag (brief 04's outcome).

Waits on the owner: open and close OS windows with their zoom beside a
playing Linux window in Chrome on a machine with a real GPU. If it doesn't
crash, a brief brings the zoom back; if it does, close this todo.
