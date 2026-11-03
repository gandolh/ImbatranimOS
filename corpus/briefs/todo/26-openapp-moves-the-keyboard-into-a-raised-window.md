# Brief 26 — `openApp` moves the keyboard into a raised window

## Context

Since 2026-10-28 every new window gets the keyboard from its own mount, and
a window raised from a desktop icon, a toast's action,
`system.window.focus()` or an app's `system.intents.openApp` gets it too,
through `openWithKeyboard` in
`apps/core/src/shared/components/window/focusIntoWindow.ts`. A read of the
callers left these raising an already open window **without** the keyboard:

- the palette's recent-files and files sources (`recentFilesSource.ts`,
  `filesSource.ts`);
- the Notification panel's rows (`NotificationPanel.tsx`);
- the Start menu's recent files (`StartMenu.tsx`);
- the desktop's context menu (`DesktopContextMenu.tsx`, Change wallpaper →
  Settings);
- Settings → Marketplace's Open buttons (`MarketplaceSettings.tsx`);
- the marketplace's refusal panel (`RefusalPanel.tsx`).

The owner decided on 2026-11-03: fix it once, inside `openApp`
(`apps/core/src/shared/intents/openApp.ts`), not caller by caller, so a
future caller can't miss it. Also settled on 2026-10-28 and not part of
this brief: Ctrl+K and the other global shortcuts stay in the bubbling
phase, so a Terminal that has the keyboard keeps them. Promoted from the
todo `keyboard-gaps-left-after-the-focus-fixes`.

## Spec

1. `openApp` moves the keyboard into the window it opens or raises, the way
   `openWithKeyboard` does today.
2. Remove the `openWithKeyboard(() => openApp(...))` wrappers that become
   redundant (`createSystemHandle.ts`, `ToastHost.tsx`, `Desktop.tsx`), or
   reduce `openWithKeyboard` to what's left of it. A new window must still
   get the keyboard exactly once, not from both its mount and `openApp`.
3. If some caller must raise a window without taking the keyboard (check
   each in the list above), give `openApp` an explicit option for it rather
   than a second path.
4. Fix the comment on `launchApp` in `Taskbar.tsx`, which still says a new
   window "is left to its app"; it gets the keyboard from its mount.

## Acceptance

- Each caller in the list raises an open window with the keyboard in it: a
  test drives at least the palette, the Start menu's recent files and the
  Notification panel against an already open window.
- A new window still gets the keyboard once, from its mount.
- Typecheck, lint and `apps/core`'s tests for these files pass.

## Files you OWN

- `apps/core/src/shared/intents/openApp.ts`
- `apps/core/src/shared/components/window/focusIntoWindow.ts` and its test
- the callers above, only where a wrapper goes away
- `apps/core/src/shared/components/taskbar/Taskbar.tsx` (the comment)
