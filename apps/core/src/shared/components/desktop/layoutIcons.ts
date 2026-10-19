export const ICON_WIDTH = 64
export const ICON_HEIGHT = 80
export const GRID_GAP = 16
export const PADDING = 16

export type Point = { x: number; y: number }

/**
 * Place desktop icons in columns, top to bottom, wrapping into a new column.
 *
 * Replaces a fixed `Math.floor(index / 8)`, which assumed eight rows always
 * fit. Eight rows need 8 × (80 + 16) = 768px, but the desktop layer is only
 * `viewportHeight - 44` tall and is `overflow-hidden`, so on a 577px-tall
 * viewport rows six through eight were simply gone — and with them the only way
 * to launch those apps.
 *
 * Two further rules matter:
 *
 * - Placement is driven by the list of icons **actually rendered**. The old
 *   code enumerated the whole registry, including `settings`, which is never
 *   drawn on the desktop — so its index left a permanent hole in the grid.
 * - Every cell a pinned (user-dragged) icon covers is skipped, so auto-placed
 *   icons can never be laid on top of one, on or off the grid.
 *
 * Pure, so it is testable without a DOM.
 */
export function layoutIcons(
  appIds: string[],
  pinned: Record<string, Point>,
  viewport: { width: number; height: number }
): Record<string, Point> {
  const stride = ICON_HEIGHT + GRID_GAP
  const colStride = ICON_WIDTH + GRID_GAP
  const usableHeight = Math.max(0, viewport.height - PADDING * 2)
  const rows = Math.max(1, Math.floor((usableHeight + GRID_GAP) / stride))

  // Cells a user-placed icon covers, so auto placement skips them. A pinned
  // icon sits wherever it was dropped, usually between grid cells, so it can
  // cover up to four of them. Marking only the one cell its corner rounds to
  // left the others free, and auto icons were laid on top of it (brief 159).
  // The pinned point is clamped first because that is where it is drawn.
  const taken = new Set<string>()
  for (const raw of Object.values(pinned)) {
    const pos = clampToDesktop(raw, viewport)
    const col0 = Math.floor((pos.x - PADDING) / colStride)
    const row0 = Math.floor((pos.y - PADDING) / stride)
    for (let col = Math.max(0, col0 - 1); col <= col0 + 1; col++) {
      for (let row = Math.max(0, row0 - 1); row <= row0 + 1; row++) {
        if (overlaps(pos, { x: PADDING + col * colStride, y: PADDING + row * stride })) {
          taken.add(`${col},${row}`)
        }
      }
    }
  }

  const out: Record<string, Point> = {}
  let cursor = 0
  for (const appId of appIds) {
    if (pinned[appId]) continue
    let col = Math.floor(cursor / rows)
    let row = cursor % rows
    while (taken.has(`${col},${row}`)) {
      cursor++
      col = Math.floor(cursor / rows)
      row = cursor % rows
    }
    taken.add(`${col},${row}`)
    out[appId] = {
      x: PADDING + col * colStride,
      y: PADDING + row * stride,
    }
    cursor++
  }
  return out
}

/** Whether two icon footprints at these top-left corners intersect. */
export function overlaps(a: Point, b: Point): boolean {
  return (
    a.x < b.x + ICON_WIDTH &&
    b.x < a.x + ICON_WIDTH &&
    a.y < b.y + ICON_HEIGHT &&
    b.y < a.y + ICON_HEIGHT
  )
}

/**
 * Keep an icon's whole footprint inside the desktop.
 *
 * A pinned icon keeps the owner's point in the store, so it goes back there
 * when the desktop grows again, but it is drawn clamped: a point the shrunken
 * desktop no longer contains would otherwise be clipped away by the layer's
 * `overflow-hidden`, with the app on it.
 */
export function clampToDesktop(p: Point, viewport: { width: number; height: number }): Point {
  return {
    x: Math.max(0, Math.min(p.x, viewport.width - ICON_WIDTH)),
    y: Math.max(0, Math.min(p.y, viewport.height - ICON_HEIGHT)),
  }
}
