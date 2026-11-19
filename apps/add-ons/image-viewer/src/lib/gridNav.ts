/** A tile's top-left corner on screen, as `offsetTop` / `offsetLeft` give it. */
export type Cell = { top: number; left: number };

/**
 * The tile above (`-1`) or below (`1`) tile `i`: in the nearest other row, the
 * one whose left edge is closest. Rows are told apart by `top`, so the move
 * crosses a day heading as well. No row that way leaves `i` where it is.
 */
export function verticalTarget(cells: readonly Cell[], i: number, dir: 1 | -1): number {
  const from = cells[i];
  if (!from) return i;
  let rowTop: number | null = null;
  for (const c of cells) {
    const further = dir === 1 ? c.top > from.top : c.top < from.top;
    if (!further) continue;
    if (rowTop === null || (dir === 1 ? c.top < rowTop : c.top > rowTop)) rowTop = c.top;
  }
  if (rowTop === null) return i;
  let best = i;
  let bestGap = Infinity;
  cells.forEach((c, j) => {
    if (c.top !== rowTop) return;
    const gap = Math.abs(c.left - from.left);
    if (gap < bestGap) {
      best = j;
      bestGap = gap;
    }
  });
  return best;
}
