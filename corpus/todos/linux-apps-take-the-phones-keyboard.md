---
title: Linux apps take the phone's on-screen keyboard
created: 2026-11-06
status: promoted
tags: [linux-apps, phone, input]
---

# Linux apps take the phone's on-screen keyboard

Found measuring the research on the OS's apps as Linux apps (2026-11-06,
[research-native-apps-via-wayland-measured.md](../wiki/research-native-apps-via-wayland-measured.md)
§3). On Android, the main phone, no Linux app can be typed into: not
Firefox, not xterm, not LibreOffice. This holds whatever the owner answers
to that research.

Two gaps, both confirmed in Chrome's Android emulation:

- **No keyboard comes up.** A tap focuses the window's `div` (`tabIndex` 0,
  "Linux app window" in `LinuxWindowBody.tsx`). Nothing in it is editable,
  and Android's Chrome raises the on-screen keyboard only for an editable
  element.
- **Its text would be dropped anyway.** A soft keyboard sends committed and
  composed text (`beforeinput`, composition) and keydowns with keyCode 229
  and an empty `code`. Even Backspace and Enter arrive with an empty `code`.
  The window maps only `KeyboardEvent.code` (`keymap.ts`), so no `key`
  message goes out. A hardware keyboard paired with the phone works.

Ways to fix it, smallest first:

1. **In the tab only.** A hidden `textarea` in the window takes focus on a
   touch tap. Its `beforeinput` text becomes key presses through a reverse
   of the US or Romanian layout (Shift for capitals), and code-less
   Backspace and Enter map by `key`. No preedit, no autocorrect context, and
   characters outside the layout are lost.
2. **text-input-v3 in the host**, so GTK, Qt and Firefox report the focused
   field (purpose, surrounding text, cursor) and take committed and composed
   text back. Another session drafted this as brief 45 on 2026-11-06, as a
   prototype that wasn't committed when this todo was written.

Before either: the owner's two-minute check on a real phone (the measured
page, §3). Write the result here.
