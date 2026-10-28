---
title: Keyboard gaps left after briefs 178 and 180
created: 2026-10-28
status: open
tags: [core, shell, keyboard]
---

# Keyboard gaps left after briefs 178 and 180

Brief 180 puts the keyboard in every new window and in a window raised from a
desktop icon, a toast's action, `system.window.focus()` or an app's
`system.intents.openApp`. Its walk on 2026-10-28 and a read of the callers left
these:

- **Ctrl+K does nothing while a Terminal has the keyboard.** The global
  hotkeys (`useGlobalHotkeys.ts`, and `bindHotkeys` in `createSystemHandle.ts`)
  listen on `window` in the bubbling phase, and xterm stops the keydown, the
  same cause brief 178 fixed for Alt+Tab. Since brief 180 a new Terminal has
  the keyboard at once, so this comes up more. The taskbar's Search button
  still opens the palette. Moving them to the capture phase would also take
  the key from the Terminal, which for Ctrl+K may be wanted and for Ctrl+W
  (close the shell's word) may not; that is the call.
  **Decided by the owner, 2026-10-28: the shell keeps them.** Ctrl+K and the
  other global shortcuts stay in the bubbling phase, so while a Terminal has
  the keyboard they go to the shell. Only Alt+Tab is taken in the capture
  phase (brief 178). This item is settled; the ones below stay open.
- **Other `openApp` callers that can raise an open window** move no focus:
  the palette's recent-files and files sources (`recentFilesSource.ts`,
  `filesSource.ts`), the Notification panel's rows (`NotificationPanel.tsx`),
  the Start menu's recent files (`StartMenu.tsx`), the desktop's context menu
  (`DesktopContextMenu.tsx`, Change wallpaper → Settings), Settings →
  Marketplace's Open buttons (`MarketplaceSettings.tsx`) and brief 175's
  refusal panel. A new window still gets the keyboard from its own mount; an
  already open one is raised without it. Brief 180 did not own these files.
  `openWithKeyboard` in `focusIntoWindow.ts` is the helper each would call,
  or `openApp` itself could, which would cover them all at once.
- `Taskbar.tsx`'s `launchApp` comment still says a new window "is left to its
  app"; since brief 180 it gets the keyboard from its mount.
