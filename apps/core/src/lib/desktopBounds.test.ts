import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampIconPosition,
  clampWindowRect,
  getDesktopBounds,
  healIconPositions,
  DESKTOP_PADDING,
  ICON_HEIGHT,
  ICON_WIDTH,
} from './desktopBounds'

// The reported short viewport: 1280×577 with a 44px taskbar → usable 1280×533.
const VW = 1280
const VH = 577
const TASKBAR = 44

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: VW, innerHeight: VH })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDesktopBounds', () => {
  it('excludes the taskbar and applies padding', () => {
    expect(getDesktopBounds(DESKTOP_PADDING)).toEqual({
      left: DESKTOP_PADDING,
      top: DESKTOP_PADDING,
      right: VW - DESKTOP_PADDING,
      bottom: VH - TASKBAR - DESKTOP_PADDING,
    })
  })
})

describe('clampIconPosition (self-heal on load)', () => {
  it('pulls an out-of-bounds persisted position back into bounds', () => {
    const clamped = clampIconPosition({ x: 99999, y: 99999 })
    // The icon's full footprint must stay above the taskbar and on-screen.
    expect(clamped.x + ICON_WIDTH).toBeLessThanOrEqual(VW - DESKTOP_PADDING)
    expect(clamped.y + ICON_HEIGHT).toBeLessThanOrEqual(VH - TASKBAR - DESKTOP_PADDING)
    expect(clamped.x).toBeGreaterThanOrEqual(DESKTOP_PADDING)
    expect(clamped.y).toBeGreaterThanOrEqual(DESKTOP_PADDING)
  })

  it('leaves an in-bounds position untouched', () => {
    expect(clampIconPosition({ x: 32, y: 48 })).toEqual({ x: 32, y: 48 })
  })

  it('heals a whole persisted map', () => {
    const healed = healIconPositions({
      good: { x: 32, y: 48 },
      belowTaskbar: { x: 32, y: 5000 },
    })
    expect(healed.good).toEqual({ x: 32, y: 48 })
    expect(healed.belowTaskbar.y + ICON_HEIGHT).toBeLessThanOrEqual(VH - TASKBAR - DESKTOP_PADDING)
  })
})

describe('clampIconPosition (drag past the taskbar)', () => {
  it('persists a clamped value when a drag ends below the taskbar', () => {
    // Simulate DesktopIcon.onDragEnd: position + raw (unconstrained) offset.
    const dragged = clampIconPosition({ x: 100 + 0, y: 100 + 2000 })
    expect(dragged.y + ICON_HEIGHT).toBeLessThanOrEqual(VH - TASKBAR - DESKTOP_PADDING)
  })
})

describe('clampWindowRect (window open/drag)', () => {
  it('caps height to vh − taskbar so the bottom row stays reachable', () => {
    // Calculator: 320×480 opened near the bottom would clip its `=` row.
    const { position, size } = clampWindowRect({ x: 480, y: 300 }, { width: 320, height: 480 })
    expect(size.height).toBeLessThanOrEqual(VH - TASKBAR)
    expect(position.y + size.height).toBeLessThanOrEqual(VH - TASKBAR)
    expect(position.x + size.width).toBeLessThanOrEqual(VW)
    expect(position.x).toBeGreaterThanOrEqual(0)
    expect(position.y).toBeGreaterThanOrEqual(0)
  })

  it('never shrinks below minSize, even when minSize exceeds the available bounds', () => {
    // Usable area is 1280×533; a minSize bigger than that on both axes must
    // still be honored in full, not clamped down to the viewport.
    const minSize = { width: 1400, height: 700 }
    const { position, size } = clampWindowRect(
      { x: 480, y: 300 },
      { width: 320, height: 900 },
      minSize
    )
    expect(size.width).toBe(minSize.width)
    expect(size.height).toBe(minSize.height)
    // Overflow is accepted, but the top-left corner must stay in-bounds.
    expect(position.x).toBe(0)
    expect(position.y).toBe(0)
  })
})

describe('desktopStore hydration (server-backed prefs)', () => {
  it('self-heals an out-of-bounds server blob on rehydrate', async () => {
    // Serve a desktop pref carrying an out-of-bounds icon position. Rehydrating
    // from the server-seeded prefs cache must re-run the store's self-heal.
    vi.resetModules()
    vi.doMock('./axios', () => ({
      api: {
        get: vi.fn().mockResolvedValue({
          data: {
            desktop: {
              state: { iconPositions: { calculator: { x: 99999, y: 99999 } } },
              version: 0,
            },
          },
        }),
        put: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    }))

    const { loadPrefs } = await import('./prefs')
    const { useDesktopStore } = await import('../shared/store/desktopStore')

    await loadPrefs()
    await useDesktopStore.persist.rehydrate()

    const pos = useDesktopStore.getState().iconPositions.calculator
    expect(pos).toBeDefined()
    expect(pos.x + ICON_WIDTH).toBeLessThanOrEqual(VW - DESKTOP_PADDING)
    expect(pos.y + ICON_HEIGHT).toBeLessThanOrEqual(VH - TASKBAR - DESKTOP_PADDING)

    vi.doUnmock('./axios')
  })
})
