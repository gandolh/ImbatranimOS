import { isPhoneWidth } from "../../../lib/phone";

/**
 * One desktop icon's cell (2026-11-13): an 80 px column holding a 40 px tile
 * 8 px from the top and a label of up to two lines under it. Rows are 96 px
 * apart, 88 on a phone, where the label is a 16 px line.
 */
export const ICON_WIDTH = 80;
export const ICON_HEIGHT = 84;
export const GRID_GAP = 12;
export const PHONE_GRID_GAP = 4;
export const PADDING = 8;

export type Point = { x: number; y: number };

/**
 * Place desktop icons in columns, top to bottom, wrapping into a new column.
 *
 * Replaces a fixed `Math.floor(index / 8)`, which assumed eight rows always
 * fit. Eight rows need 8 × (80 + 16) = 768px, but the desktop layer is only
 * `viewportHeight - 44` tall and is `overflow-hidden`, so on a 577px-tall
 * viewport rows six through eight were simply gone — and with them the only way
 * to launch those apps.
 *
 * On a phone (under 600 px) the columns stop at the screen's width and the
 * rows run on past the measured height; the desktop scrolls down to them.
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
  viewport: { width: number; height: number },
): Record<string, Point> {
  const phone = isPhoneWidth(viewport.width);
  const stride = ICON_HEIGHT + (phone ? PHONE_GRID_GAP : GRID_GAP);
  const colStride = ICON_WIDTH;
  const usableHeight = Math.max(0, viewport.height - PADDING * 2);
  const fit = Math.max(1, Math.floor(usableHeight / stride));
  // On a phone the columns stop at the screen's width: what does not fit goes
  // on in rows below, and the desktop scrolls down to them, never sideways
  // and never under the taskbar. Elsewhere a new column starts on the right.
  const columns = Math.max(1, Math.floor((viewport.width - PADDING * 2) / colStride));
  const rows = phone ? Math.max(fit, Math.ceil(appIds.length / columns)) : fit;

  // Cells a user-placed icon covers, so auto placement skips them. A pinned
  // icon sits wherever it was dropped, usually between grid cells, so it can
  // cover up to four of them. Marking only the one cell its corner rounds to
  // left the others free, and auto icons were laid on top of it.
  // The pinned point is clamped first because that is where it is drawn.
  const taken = new Set<string>();
  for (const raw of Object.values(pinned)) {
    const pos = clampToDesktop(raw, viewport);
    const col0 = Math.floor((pos.x - PADDING) / colStride);
    const row0 = Math.floor((pos.y - PADDING) / stride);
    for (let col = Math.max(0, col0 - 1); col <= col0 + 1; col++) {
      for (let row = Math.max(0, row0 - 1); row <= row0 + 1; row++) {
        if (overlaps(pos, { x: PADDING + col * colStride, y: PADDING + row * stride })) {
          taken.add(`${col},${row}`);
        }
      }
    }
  }

  const out: Record<string, Point> = {};
  let cursor = 0;
  for (const appId of appIds) {
    if (pinned[appId]) continue;
    let col = Math.floor(cursor / rows);
    let row = cursor % rows;
    while (taken.has(`${col},${row}`)) {
      cursor++;
      col = Math.floor(cursor / rows);
      row = cursor % rows;
    }
    taken.add(`${col},${row}`);
    out[appId] = {
      x: PADDING + col * colStride,
      y: PADDING + row * stride,
    };
    cursor++;
  }
  return out;
}

/** Whether two icon footprints at these top-left corners intersect. */
export function overlaps(a: Point, b: Point): boolean {
  return a.x < b.x + ICON_WIDTH && b.x < a.x + ICON_WIDTH && a.y < b.y + ICON_HEIGHT && b.y < a.y + ICON_HEIGHT;
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
  };
}
