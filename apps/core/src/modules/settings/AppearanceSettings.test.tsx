// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/axios', () => ({
  api: {
    get: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: {} }),
    delete: () => Promise.resolve({ data: null }),
  },
}))

import { useAppearanceStore } from '../../shared/store/appearanceStore'
import { useWallpaperStore } from '../../shared/store/wallpaperStore'
import { AppearanceSettings } from './AppearanceSettings'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Settings → Appearance: Theme, Mode, Accent and Wallpaper as radio groups.
 * The arrow keys move between options and Space/Enter chooses; switching
 * theme brings back that theme's own accent and wallpaper.
 */

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  useAppearanceStore.setState({
    theme: 'apricot',
    mode: 'light',
    accents: { apricot: 'sky', classic: 'cobalt' },
  })
  useWallpaperStore.setState({ wallpapers: { apricot: 'plain', classic: 'grid' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<AppearanceSettings />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function group(name: string): HTMLElement {
  const groups = [...host.querySelectorAll<HTMLElement>('[role="radiogroup"]')]
  const found = groups.find(
    (g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent === name
  )
  if (!found) throw new Error(`no radio group labelled ${name}`)
  return found
}

function radios(g: HTMLElement): HTMLElement[] {
  return [...g.querySelectorAll<HTMLElement>('[role="radio"]')]
}

function checked(g: HTMLElement): string[] {
  return radios(g)
    .filter((r) => r.getAttribute('aria-checked') === 'true')
    .map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '')
}

function key(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  })
}

describe('Appearance', () => {
  it('reads Theme, Mode, Accent, Wallpaper, in that order', () => {
    const labels = [...host.querySelectorAll('[role="radiogroup"]')].map(
      (g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent
    )
    expect(labels).toEqual(['Theme', 'Mode', 'Accent', 'Wallpaper'])
  })

  it('names each theme card and marks the current one', () => {
    const cards = radios(group('Theme'))
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Apricot theme',
      'Classic theme',
    ])
    expect(checked(group('Theme'))).toEqual(['Apricot theme'])
  })

  it('draws each card under its own theme and the current mode', () => {
    const scopes = [...host.querySelectorAll('[data-os-theme]')]
    expect(
      scopes.map((s) => [s.getAttribute('data-os-theme'), s.getAttribute('data-theme')])
    ).toEqual([
      ['apricot', 'light'],
      ['classic', 'light'],
    ])
  })

  it('puts only the chosen option of each group in the Tab order', () => {
    for (const name of ['Theme', 'Mode', 'Accent', 'Wallpaper']) {
      const tabbable = radios(group(name)).filter((r) => r.tabIndex === 0)
      expect(tabbable, name).toHaveLength(1)
      expect(tabbable[0].getAttribute('aria-checked'), name).toBe('true')
    }
  })

  it('moves with the arrow keys without choosing, and chooses on click (Space/Enter)', () => {
    const cards = radios(group('Theme'))
    act(() => cards[0].focus())
    key(cards[0], 'ArrowRight')
    expect(document.activeElement).toBe(cards[1])
    expect(useAppearanceStore.getState().theme).toBe('apricot')

    key(cards[1], 'ArrowRight')
    expect(document.activeElement).toBe(cards[0])
    key(cards[0], 'End')
    expect(document.activeElement).toBe(cards[1])

    act(() => cards[1].click())
    expect(useAppearanceStore.getState().theme).toBe('classic')
  })

  it("lists the chosen theme's own accents and wallpapers, with its saved choices", () => {
    expect(checked(group('Accent'))).toEqual(['Sky'])
    expect(checked(group('Wallpaper'))).toEqual(['Plain'])

    act(() => radios(group('Theme'))[1].click())

    expect(radios(group('Accent')).map((r) => r.textContent)).toEqual([
      'Crimson',
      'Cobalt',
      'Emerald',
      'Signal Orange',
    ])
    expect(checked(group('Accent'))).toEqual(['Cobalt'])
    expect(checked(group('Wallpaper'))).toEqual(['Grid'])
  })

  it('switches the mode', () => {
    act(() => radios(group('Mode'))[1].click())
    expect(useAppearanceStore.getState().mode).toBe('dark')
    expect(checked(group('Mode'))).toEqual(['Dark'])
  })
})
