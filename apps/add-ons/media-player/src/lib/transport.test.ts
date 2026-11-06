import { describe, expect, it } from 'vitest'
import { clampSeek, elementLoudness } from './transport'

describe('clampSeek', () => {
  it('clamps below zero to zero', () => {
    expect(clampSeek(-30, 100)).toBe(0)
  })
  it('clamps past the end to the duration', () => {
    expect(clampSeek(500, 100)).toBe(100)
  })
  it('passes a target inside the range through', () => {
    expect(clampSeek(42.5, 100)).toBe(42.5)
  })
  it('refuses to seek before metadata loads (NaN duration)', () => {
    // Assigning NaN to currentTime silently wedges the element.
    expect(clampSeek(10, NaN)).toBeNull()
  })
  it('refuses to seek on a live/unseekable stream (Infinity duration)', () => {
    expect(clampSeek(10, Infinity)).toBeNull()
  })
  it('refuses a non-finite target', () => {
    expect(clampSeek(NaN, 100)).toBeNull()
    expect(clampSeek(Infinity, 100)).toBeNull()
  })
  it('refuses a zero-length media', () => {
    expect(clampSeek(0, 0)).toBeNull()
  })
})

describe('elementLoudness', () => {
  it('multiplies the player volume by the OS volume', () => {
    expect(elementLoudness({ volume: 0.5, muted: false }, { volume: 0.4, muted: false })).toEqual({
      volume: 0.2,
      muted: false,
    })
  })

  it('is silent when either the player or the OS is muted', () => {
    const quiet = { volume: 1, muted: true }
    const loud = { volume: 1, muted: false }
    expect(elementLoudness(quiet, loud).muted).toBe(true)
    expect(elementLoudness(loud, quiet).muted).toBe(true)
    expect(elementLoudness(loud, loud)).toEqual({ volume: 1, muted: false })
  })
})
