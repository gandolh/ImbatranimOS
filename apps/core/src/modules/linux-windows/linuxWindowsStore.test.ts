import { afterEach, describe, expect, it, vi } from 'vitest'
import { linuxWindowsDrawing, noteLinuxFrame } from './linuxWindowsStore'

describe('a Linux window drawing holds the idle cover off', () => {
  afterEach(() => vi.restoreAllMocks())

  it('counts a frame big enough to watch, for a few seconds', () => {
    let now = 1_000_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    noteLinuxFrame(20)
    expect(linuxWindowsDrawing()).toBe(false)
    noteLinuxFrame(480 * 270)
    expect(linuxWindowsDrawing()).toBe(true)
    now += 2_000
    expect(linuxWindowsDrawing()).toBe(true)
    now += 2_000
    expect(linuxWindowsDrawing()).toBe(false)
  })
})
