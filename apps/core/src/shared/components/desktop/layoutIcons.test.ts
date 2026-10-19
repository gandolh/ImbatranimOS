import { describe, expect, it } from 'vitest'
import {
  GRID_GAP,
  ICON_HEIGHT,
  ICON_WIDTH,
  PADDING,
  clampToDesktop,
  layoutIcons,
  overlaps,
  type Point,
} from './layoutIcons'

const STRIDE = ICON_HEIGHT + GRID_GAP
const ids = (n: number) => Array.from({ length: n }, (_, i) => `app-${i}`)

/** Every icon must sit inside the usable area and never share a cell. */
function assertSane(
  out: Record<string, { x: number; y: number }>,
  viewport: { width: number; height: number }
) {
  const seen = new Set<string>()
  for (const [id, p] of Object.entries(out)) {
    expect(p.y, `${id} must not sit above the top edge`).toBeGreaterThanOrEqual(0)
    expect(p.x, `${id} must not sit left of the edge`).toBeGreaterThanOrEqual(0)
    expect(p.y + ICON_HEIGHT, `${id} must fit above the bottom edge`).toBeLessThanOrEqual(
      viewport.height
    )
    const key = `${p.x},${p.y}`
    expect(seen.has(key), `${id} overlaps another icon at ${key}`).toBe(false)
    seen.add(key)
  }
}

describe('layoutIcons', () => {
  it('derives rows from the viewport height instead of a fixed 8', () => {
    // The old code hardcoded 8 rows, needing 8*96=768px. A short desktop has
    // nowhere near that, and the overflow was clipped away with the apps in it.
    const short = layoutIcons(ids(23), {}, { width: 1280, height: 533 })
    const tall = layoutIcons(ids(23), {}, { width: 1440, height: 856 })

    const shortCols = new Set(Object.values(short).map((p) => p.x)).size
    const tallCols = new Set(Object.values(tall).map((p) => p.x)).size

    expect(shortCols).toBeGreaterThan(tallCols)
    assertSane(short, { width: 1280, height: 533 })
    assertSane(tall, { width: 1440, height: 856 })
  })

  it('never places an icon below the usable height', () => {
    const viewport = { width: 1280, height: 533 }
    const out = layoutIcons(ids(23), {}, viewport)
    for (const p of Object.values(out)) {
      expect(p.y + ICON_HEIGHT).toBeLessThanOrEqual(viewport.height)
    }
  })

  it('places nothing on top of a pinned icon', () => {
    // Pin the cell an auto icon would otherwise take (col 0, row 1).
    const pinned = { pinnedApp: { x: PADDING, y: PADDING + STRIDE } }
    const out = layoutIcons(ids(6), pinned, { width: 1280, height: 533 })

    expect(out.pinnedApp, 'a pinned icon is not re-placed').toBeUndefined()
    for (const p of Object.values(out)) {
      expect(`${p.x},${p.y}`).not.toBe(`${PADDING},${PADDING + STRIDE}`)
    }
    assertSane({ ...out, ...pinned }, { width: 1280, height: 533 })
  })

  it('lays out only the ids it is given', () => {
    // `settings` used to consume an index while never being rendered, which
    // left a permanent hole in the grid.
    const out = layoutIcons(['a', 'b', 'c'], {}, { width: 1280, height: 533 })
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c'])
    // Consecutive ids occupy consecutive rows — no gap.
    expect(out.b.y - out.a.y).toBe(STRIDE)
    expect(out.c.y - out.b.y).toBe(STRIDE)
  })

  it('survives a viewport too short for even one row', () => {
    const out = layoutIcons(ids(3), {}, { width: 400, height: 10 })
    expect(Object.keys(out)).toHaveLength(3)
    // One row minimum, so each icon goes into its own column rather than
    // stacking invisibly on top of the previous one.
    expect(new Set(Object.values(out).map((p) => p.x)).size).toBe(3)
  })

  it('is deterministic', () => {
    const a = layoutIcons(ids(23), {}, { width: 1280, height: 533 })
    const b = layoutIcons(ids(23), {}, { width: 1280, height: 533 })
    expect(a).toEqual(b)
  })

  describe('after a resize, with pinned icons (brief 159)', () => {
    const TALL = { width: 1440, height: 856 }
    const SHORT = { width: 1440, height: 456 }

    /** Lay out, then draw the pinned icons clamped, the way Desktop does. */
    function drawn(n: number, pinned: Record<string, Point>, viewport: typeof TALL) {
      const out: Record<string, Point> = { ...layoutIcons(ids(n), pinned, viewport) }
      for (const [id, p] of Object.entries(pinned)) out[id] = clampToDesktop(p, viewport)
      return out
    }

    function overlapping(out: Record<string, Point>) {
      const entries = Object.entries(out)
      const pairs: string[] = []
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          if (overlaps(entries[i][1], entries[j][1]))
            pairs.push(`${entries[i][0]}|${entries[j][0]}`)
        }
      }
      return pairs
    }

    it('keeps auto icons off a pinned icon that sits between grid cells', () => {
      // Measured in the browser: Paint dropped at 64,70 covers cells (0,0),
      // (1,0), (0,1) and (1,1). Only (1,1) used to be marked taken, so three
      // auto icons were laid on top of it.
      const pinned = { 'app-3': { x: 64, y: 70 } }
      expect(overlapping(drawn(29, pinned, TALL))).toEqual([])
      expect(overlapping(drawn(29, pinned, SHORT))).toEqual([])
    })

    it('has no overlaps through shrink, grow, and shrink again', () => {
      const pinned = {
        'app-0': { x: 64, y: 70 },
        'app-5': { x: 300, y: 610 },
        'app-9': { x: 900, y: 400 },
      }
      for (const viewport of [TALL, SHORT, TALL, SHORT]) {
        const out = drawn(29, pinned, viewport)
        expect(overlapping(out), `at ${viewport.height}px`).toEqual([])
        assertInside(out, viewport)
      }
    })

    it('clamps a pinned icon the shrunken desktop no longer contains', () => {
      // Pinned near the bottom of a tall desktop: y 700 is below a 456px one.
      const pinned = { 'app-2': { x: 16, y: 700 } }
      const out = drawn(29, pinned, SHORT)
      expect(out['app-2']).toEqual({ x: 16, y: SHORT.height - ICON_HEIGHT })
      expect(overlapping(out)).toEqual([])
      assertInside(out, SHORT)
    })

    it('puts a clamped icon back where the owner left it once the desktop grows', () => {
      const p = { x: 1400, y: 700 }
      expect(clampToDesktop(p, SHORT)).toEqual({
        x: SHORT.width - ICON_WIDTH,
        y: SHORT.height - ICON_HEIGHT,
      })
      expect(clampToDesktop(p, { width: 1920, height: 1000 })).toEqual(p)
    })
  })
})

/** Every icon's whole footprint lies inside the desktop. */
function assertInside(out: Record<string, Point>, viewport: { width: number; height: number }) {
  for (const [id, p] of Object.entries(out)) {
    expect(p.x, `${id} left`).toBeGreaterThanOrEqual(0)
    expect(p.y, `${id} top`).toBeGreaterThanOrEqual(0)
    expect(p.x + ICON_WIDTH, `${id} right`).toBeLessThanOrEqual(viewport.width)
    expect(p.y + ICON_HEIGHT, `${id} bottom`).toBeLessThanOrEqual(viewport.height)
  }
}
