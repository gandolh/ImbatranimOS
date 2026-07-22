import { TASKBAR_HEIGHT } from '../shared/store/windowStore'

// Desktop icon grid metrics — shared by the layout, the drag handler, and the
// store's self-heal pass so all three agree on a cell's footprint.
export const ICON_WIDTH = 64
export const ICON_HEIGHT = 80
export const GRID_GAP = 16
export const DESKTOP_PADDING = 16

export type Bounds = { left: number; top: number; right: number; bottom: number }
export type Rect = { x: number; y: number; width: number; height: number }

/**
 * The reachable desktop region: the whole viewport above the 44px taskbar,
 * inset by `padding`. Read live from `window` so it tracks viewport resizes.
 */
export function getDesktopBounds(padding = 0): Bounds {
  return {
    left: padding,
    top: padding,
    right: window.innerWidth - padding,
    bottom: window.innerHeight - TASKBAR_HEIGHT - padding,
  }
}

/**
 * Clamp a rect so it sits fully inside `bounds`. Size is capped to the bounds
 * first (never larger than the desktop), then the top-left is pinned so the far
 * edge can't spill past — the shared primitive behind both the icon and the
 * window clamps.
 */
export function clampRectToBounds(rect: Rect, bounds: Bounds): Rect {
  const width = Math.min(rect.width, bounds.right - bounds.left)
  const height = Math.min(rect.height, bounds.bottom - bounds.top)
  const x = Math.max(bounds.left, Math.min(rect.x, bounds.right - width))
  const y = Math.max(bounds.top, Math.min(rect.y, bounds.bottom - height))
  return { x, y, width, height }
}

/** Clamp an icon's top-left so its full 64×80 footprint stays on the desktop. */
export function clampIconPosition(position: { x: number; y: number }): { x: number; y: number } {
  const { x, y } = clampRectToBounds(
    { x: position.x, y: position.y, width: ICON_WIDTH, height: ICON_HEIGHT },
    getDesktopBounds(DESKTOP_PADDING)
  )
  return { x, y }
}

/** Re-clamp every persisted icon position into the current bounds (self-heal). */
export function healIconPositions(
  positions: Record<string, { x: number; y: number }>
): Record<string, { x: number; y: number }> {
  const healed: Record<string, { x: number; y: number }> = {}
  for (const [id, pos] of Object.entries(positions)) {
    healed[id] = clampIconPosition(pos)
  }
  return healed
}

/**
 * Clamp a window's position + size to the desktop: never taller/wider than the
 * usable region, never opened or dragged under the taskbar / off-screen.
 *
 * `minSize`, when given, floors the shrunk size so a window is never clamped
 * below the size its own chrome needs (e.g. Calculator's `=` row). If the
 * floor is bigger than the available bounds, the window keeps minSize and
 * accepts overflow — anchored so its top-left corner stays on-screen.
 */
export function clampWindowRect(
  position: { x: number; y: number },
  size: { width: number; height: number },
  minSize?: { width: number; height: number }
): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const bounds = getDesktopBounds(0)
  const boundsWidth = bounds.right - bounds.left
  const boundsHeight = bounds.bottom - bounds.top

  let width = Math.min(size.width, boundsWidth)
  let height = Math.min(size.height, boundsHeight)
  if (minSize) {
    width = Math.max(minSize.width, width)
    height = Math.max(minSize.height, height)
  }

  const x = Math.max(bounds.left, Math.min(position.x, bounds.right - width))
  const y = Math.max(bounds.top, Math.min(position.y, bounds.bottom - height))

  return { position: { x, y }, size: { width, height } }
}
