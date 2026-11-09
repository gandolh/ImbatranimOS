---
title: xterm's Shift+Insert pastes the clipboard
created: 2026-11-09
status: promoted
tags: [linux-apps, x11, clipboard]
---

# xterm's Shift+Insert pastes the clipboard

Found on brief 83's walk. Stock xterm pastes the PRIMARY selection on
Shift+Insert, but the Wayland host bridges only CLIPBOARD (brief 48), so a
desktop copy pasted with Shift+Insert into xterm gives nothing. The walk had
to start xterm with
`-xrm 'XTerm*VT100.translations: #override Shift <Key>Insert: insert-selection(CLIPBOARD)'`.

Two ways out: bridge PRIMARY as well (the Wayland primary-selection protocol,
`zwp_primary_selection`, plus X11 PRIMARY in the host), which is what other
Linux desktops do; or ship xterm with that resource (a per-app default the
install writes). Bridging PRIMARY follows the Unix convention and fixes every
X11 app that pastes PRIMARY, not only xterm.

Promoted to [brief 84](../briefs/todo/84-linux-apps-share-the-primary-selection.md) on 2026-11-09: PRIMARY is bridged, highlights stay among the Linux apps.
