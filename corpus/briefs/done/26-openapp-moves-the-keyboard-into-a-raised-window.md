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

## Outcome (2026-11-03)

**Built in `2162640` (version 1.115.0).**
- `openApp` calls `focusIntoWindowSoon` when it brings up a single-instance
  window that was already open (after the focus, the show and the intent). A
  new window is left to its mount (`focusIntoNewWindowSoon`), so it gets the
  keyboard once.
- Gone: `openWithKeyboard` and its tests; the wrappers in
  `createSystemHandle.ts`, `ToastHost.tsx` and `Desktop.tsx` (both of its
  calls); and the taskbar's own copy in `launchApp`, which did the same
  thing by hand. Its comment now says a new window gets the keyboard from its
  mount. `Taskbar.test.tsx`'s two Start tests became one: Start launches
  through `openApp` and adds no move of its own.
- No caller in the list must raise without the keyboard: each is a person
  choosing that window. Startup apps open only on a fresh desktop, so they
  open new windows. `openApp` therefore has no option for it.
- Settings → Marketplace's Open buttons and the refusal panel's link needed
  nothing: they call `openApp`.

**Checked:**
- `openAppKeyboard.test.tsx` (6), with the real `openApp` and window store
  and a Window.tsx-shaped fixture: a raise moves the keyboard a frame later;
  a new window and a refusal move nothing; the palette's recent files,
  Start's recent files (whose close hands focus back to the Start button
  first) and a Notification panel row each end with the keyboard in the open
  Todo window they raised. Four of the six fail with the new line removed.
- In the dev container: Settings open behind Calculator, the keyboard in
  Calculator; the desktop's Change wallpaper raised Settings with the
  keyboard in it.
- Typecheck, lint and core's full suite (647) pass.
