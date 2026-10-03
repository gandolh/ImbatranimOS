# Brief 141 — Relaunching a minimized app shows it; `openApp` keeps its contract

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · CORE
(`apps/core/src/shared/intents/openApp.ts`). Independent. Implement inline.

## Context

1. **A minimized single-instance app stays invisible when relaunched.**
   `openApp` (`apps/core/src/shared/intents/openApp.ts:47-55`) finds the
   existing window and calls only `windowStore.focusWindow(existingWindow.id)`.
   `focusWindow` (`apps/core/src/shared/store/windowStore.ts:769-795`) changes
   `zIndex` and `activeWorkspace`, never `isVisible`, and `Window.tsx:254`
   renders `display: instance.isVisible && onActiveWorkspace ? 'flex' : 'none'`.
   So each of these does nothing visible when the app's window is minimized:
   double-clicking its desktop icon (`Desktop.tsx:129,136`), launching from the
   taskbar (`Taskbar.tsx:81`), a Start-menu recent file (`StartMenu.tsx:190`),
   clicking one of its notifications, and opening a file from Files into it —
   the intent is delivered to a hidden window. The command palette
   (`shared/commands/appsSource.ts:49-51`) and Alt+Tab (`AltTabSwitcher.tsx:62`)
   already call `focusWindow` **and** `showWindow`; `openApp` is the one
   launcher missing the second call.
2. **`openApp` throws where its contract says it returns `''`.**
   `packages/ui/src/system.ts:182`: "Returns its window id, '' if refused."
   `openApp.ts:24-27` throws `Error('App "…" not found in registry')` for an
   unknown id. Stale ids are a known case elsewhere — `startup.ts` filters
   "ids the registry no longer has", and `associations.ts` checks
   `APP_REGISTRY` before trusting an override — and notification history
   persists up to 100 items across deploys. Clicking an old notification whose
   add-on was removed or renamed throws out of `NotificationPanel.tsx:130`, so
   `onClose()` on `:131` never runs.

## Files you OWN

- `apps/core/src/shared/intents/openApp.ts` and a new `openApp.test.ts`
- `apps/core/src/shared/components/notifications/NotificationPanel.tsx`, only
  if a guard is still needed after step 2

## Files you must NOT touch

- The semantics of `windowStore` actions. `focusWindow` stays
  visibility-agnostic — it is also the fast path for every in-window click.

## What to do

1. In the existing-window branch: `focusWindow(id)` (switches workspace), then
   `showWindow(id)` when the window is not visible — the palette's order.
2. Unknown `appId` → `console.warn` and return `''`, matching the disabled
   add-on branch above it and the protocol doc.

## Acceptance

- `openApp.test.ts`: a minimized single-instance window becomes visible, on
  top, with the intent delivered; a window on another workspace switches the
  workspace; an unknown id returns `''` without throwing; a disabled add-on
  returns `''` (existing behaviour).
- Core vitest, typecheck and lint green.
- In the browser: minimize Notepad, double-click its desktop icon — it
  reappears.

## Outcome (2026-10-03)

Done, in `openApp.ts` only.
- The existing-window branch calls `focusWindow` (which switches workspace), then `showWindow` when the window is hidden.
- An unknown id is `console.warn`ed and refused with `''`.
- `NotificationPanel.tsx` needed no guard, because `openApp` no longer throws. `windowStore` is untouched.

**Tests** (`openApp.test.ts`, jsdom): a minimized single-instance window becomes visible, above another window, with the intent delivered; a window on workspace 3 switches to it; an unknown id returns `''` without throwing or opening anything; a disabled add-on returns `''`. The first and third fail on the old code. Core vitest 286/286, typecheck, eslint and prettier clean.

**Fixture correction:** the brief's browser step used Notepad, but Notepad is `multiInstance: true`. Relaunching it opens a second window by design and never reaches this branch. The tests and the browser check use **Todo** (single-instance, disableable).

**Browser check** (dev server against the local Ward container; `FILES_ROOT`, `DB_PATH`, `NOTES_DIR` and `CONFIGS_DIR` on a scratch directory): opened Todo from its desktop icon, minimized it, and double-clicked the icon again. The window reappeared on top, still a single taskbar entry.
