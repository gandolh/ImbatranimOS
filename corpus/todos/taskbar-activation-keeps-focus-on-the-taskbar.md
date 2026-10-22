---
title: Activating a window from the taskbar leaves focus on the taskbar
created: 2026-10-22
status: open
tags: [core, shell, keyboard]
---

# Activating a window from the taskbar leaves focus on the taskbar

Found in imbatranim-office brief 03's walk: with two CAD windows open, click
the other one's taskbar button and type a command. Nothing happens:
`document.activeElement` is still the taskbar `<button>`, so keyboard-first
apps (CAD's command line, the Terminal, editors) need a click inside the window
first. `SystemWindow` has `focus()` and `isFocused()` but no focus-change event,
so an app cannot fix this itself. The desktop should move focus into the
window's content when it activates a window from the taskbar or Alt+Tab, as it
does on a click in the window.
