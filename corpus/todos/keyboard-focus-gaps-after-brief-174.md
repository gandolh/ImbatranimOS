---
title: Keyboard focus gaps left after brief 174
created: 2026-10-27
status: open
tags: [core, shell, keyboard]
---

# Keyboard focus gaps left after brief 174

Brief 174 moves focus into a window raised from the taskbar, Alt+Tab, the
Start menu or the palette. Its walk on 2026-10-27 found three gaps it left
alone:

- **Alt+Tab inside a Terminal does nothing.** xterm handles Tab and stops the
  keydown, so it never reaches `AltTabSwitcher`'s bubbling `window` listener.
  Seen in Chrome: a capturing listener saw the Tab keydown, the bubbling one
  did not. This was true before brief 174, but focus now lands in a Terminal
  after every taskbar or Alt+Tab activation, so switching away from one by
  keyboard fails more often. A capturing listener in the switcher would see
  it; whether Alt+Tab should then be kept from the Terminal is the call.
- **A new window from Start or the palette does not get the keyboard** unless
  its app focuses something as it mounts. A Terminal opened from Start left
  focus on the Start button. Brief 174 covered only windows that were
  already open.
- **Other ways of raising an open window don't move focus:** a desktop
  icon's double-click on an open single-instance app (`Desktop.tsx` through
  `openApp`), a toast's action, and `system.window.focus()`. Found by reading
  the code, not walked.
