# Brief 52 — Clamp desktop icons + windows to the desktop bounds

Status: **todo** · From the 2026-07-19 headless-browser walkthrough. CORE,
frontend-only. Standalone — no dependency on any other brief. Sources:
[todos/desktop-icon-layout-resolution-bugs.md](../../todos/desktop-icon-layout-resolution-bugs.md)
+ bug #2 of [todos/app-walkthrough-bugs.md](../../todos/app-walkthrough-bugs.md).

## Problem

Both desktop icons and app windows can be placed **under / below the 44px
taskbar or off-screen**, where they are unreachable, and the bad position
**persists across reloads**. Reproduced live at 1280×577:

1. **Icons render under/off the taskbar.** With 23 apps, 8 icons had their
   bottom edge below the taskbar top; 5 were entirely off-screen and
   unreachable. Root: `Desktop.tsx` lays out with a **hardcoded 8-rows-per-
   column** grid (`col = Math.floor(index / 8)`, `ICON_HEIGHT=80`,
   `GRID_GAP=16`, `PADDING=16`) → `16 + 8×96 ≈ 784px` of vertical demand, but
   the icon container is `bottom-[44px]`. On any viewport shorter than ~828px
   the bottom rows fall under/below the taskbar, and nothing re-flows on resize.
2. **Drag stores an unclamped position.** `DesktopIcon`'s `onDragEnd` writes
   `{ x: position.x + info.offset.x, y: … }`. `info.offset` is framer-motion's
   *raw, unconstrained* pointer delta — NOT clamped to `dragConstraints`. So the
   visual drag is clamped but the **stored** value isn't; the next
   `animate={{x,y}}` then re-places the icon at the unconstrained coordinate,
   which can be under the taskbar / off-screen, and it persists in
   `localStorage` (`desktop-storage`).
3. **Windows spill under the taskbar too** (the sibling bug). Several apps open
   at a default size/position whose bottom is clipped — concretely the
   **Calculator's bottom row (`0 . =`) is fully hidden**, so `=` is unreachable;
   Sheets and Calendar bottom rows likewise clip. Default window sizes/positions
   aren't clamped to `viewportHeight − TASKBAR_HEIGHT`, and cascade jitter pushes
   them further off.

## Decisions (to confirm when grilled — recommendations inline)

- **One shared "clamp to desktop bounds" primitive** used by both the icon grid
  and the window model, since (1)+(3) are the same failure. Bounds =
  `{ top: 0, left: 0, right: vw, bottom: vh − TASKBAR_HEIGHT }` minus padding.
- **Icons: re-flow from live container height, not a hardcoded 8.** Compute
  rows-per-column from `(vh − taskbar − padding) / (ICON_HEIGHT + GRID_GAP)` and
  recompute on resize (ResizeObserver / window resize). Keep the column-major
  fill order.
- **Icons: clamp the *stored* position on drag end** to the desktop bounds (use
  the constrained coordinate, not `info.offset`); consider snap-to-grid + a
  "Clean up / auto-arrange icons" action (recommended, low cost).
- **Self-heal on load.** Any persisted icon position outside current bounds is
  clamped back in on hydration, so existing `desktop-storage` blobs recover
  instead of hiding icons forever. Same for restored window layout, if any
  survives brief 49.
- **Windows: clamp default size + position at open time** to the desktop bounds
  (never taller than `vh − TASKBAR_HEIGHT`), and clamp on drag/resize end.
  Coordinate with brief 49 (which makes window layout ephemeral) so the clamp
  lives at the open/drag path, not a persistence layer that 49 removes.

## Fix

1. `apps/core/src/shared/store/desktopStore.ts` — clamp-on-write + a hydration
   self-heal pass that re-clamps every persisted position to current bounds.
2. `apps/core/src/shared/components/desktop/Desktop.tsx` — replace the hardcoded
   `/8` with a live rows-per-column computed from container height; re-flow on
   resize.
3. `apps/core/src/shared/components/desktop/DesktopIcon.tsx` — on `onDragEnd`
   persist the *clamped/constrained* position, not `position + info.offset`.
4. `apps/core/src/shared/store/windowStore.ts` + `components/window/Window.tsx` —
   clamp default open size/position and drag/resize results to
   `vh − TASKBAR_HEIGHT`. Share the bounds helper with the desktop.
5. *(optional, recommended)* a "Clean up icons" auto-arrange action.

## Must preserve (regression surface)

- Every icon is reachable at 1280×577 and other short viewports; none under/below
  the taskbar; grid re-flows on resize with no icons lost.
- A dragged icon can't be dropped (persisted) under the taskbar / off-screen.
- Existing bad `desktop-storage` blobs self-heal on next load.
- Every app window opens fully on-screen; the Calculator `=` row is reachable at
  1280×577; Sheets/Calendar bottom rows visible.
- No change to double-click-to-open, selection, or z-order behavior.

## Verify bar

`turbo typecheck`, core lint + format, `turbo build` green. Unit test: an
out-of-bounds persisted icon position clamps into bounds on load; a drag past
the taskbar persists a clamped value. **Human-gated:** at 1280×577, every
Start/desktop app opens fully visible (Calculator `=` reachable), all desktop
icons reachable, drag an icon toward the taskbar and reload — it stays in bounds.
