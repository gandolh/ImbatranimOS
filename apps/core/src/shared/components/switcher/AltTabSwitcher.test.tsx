// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { focusIntoWindowSoon } = vi.hoisted(() => ({ focusIntoWindowSoon: vi.fn() }))
vi.mock('../window/focusIntoWindow', () => ({ focusIntoWindowSoon }))
vi.mock('../../registry/registry', () => ({ APP_REGISTRY: [] }))

import { useWindowStore, type WindowInstance } from '../../store/windowStore'
import { useAuthStore } from '../../../modules/auth/store/authStore'
import { AltTabSwitcher } from './AltTabSwitcher'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Brief 174: the window Alt+Tab commits to gets the keyboard; a cancelled
 * switch moves nothing. Brief 178: the switcher hears its keys even when the
 * focused element stops them (xterm on Tab), and takes only those.
 */

function win(id: string, z: number, over: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id,
    appId: 'terminal',
    title: `Window ${id}`,
    workspaceId: 1,
    isVisible: true,
    isMaximized: false,
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    zIndex: z,
    ...over,
  }
}

let container: HTMLDivElement
let root: Root

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ authenticated: true, everAuthenticated: true, locked: false })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<AltTabSwitcher />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Alt+Tab commit (brief 174)', () => {
  it('moves focus into the window it switches to', () => {
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    key('keydown', { key: 'Tab', altKey: true })
    key('keyup', { key: 'Alt' })
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('restores a minimised window and moves focus into it', () => {
    useWindowStore.setState({
      windows: [win('a', 1, { isVisible: false }), win('b', 2)],
      activeWorkspace: 1,
    })
    key('keydown', { key: 'Tab', altKey: true })
    key('keyup', { key: 'Alt' })
    expect(useWindowStore.getState().windows.find((w) => w.id === 'a')?.isVisible).toBe(true)
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('moves nothing when the switch is cancelled with Esc', () => {
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    key('keydown', { key: 'Tab', altKey: true })
    key('keydown', { key: 'Escape', altKey: true })
    key('keyup', { key: 'Alt' })
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })

  it('does not open behind the cover screen', () => {
    useAuthStore.setState({ locked: true })
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    key('keydown', { key: 'Tab', altKey: true })
    key('keyup', { key: 'Alt' })
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })
})

describe('Alt+Tab over an element that stops its keys (brief 178)', () => {
  // Stands in for xterm: it handles every keydown/keyup and stops it.
  let term: HTMLTextAreaElement
  let termKeys: string[]

  const keyOn = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => {
    act(() => {
      term.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))
    })
  }

  beforeEach(() => {
    termKeys = []
    term = document.createElement('textarea')
    const stop = (e: KeyboardEvent) => {
      termKeys.push(`${e.type}:${e.altKey ? 'alt+' : ''}${e.key}`)
      e.stopPropagation()
    }
    term.addEventListener('keydown', stop)
    term.addEventListener('keyup', stop)
    document.body.appendChild(term)
    term.focus()
  })

  afterEach(() => term.remove())

  it('opens, steps and commits while the target stops propagation', () => {
    useWindowStore.setState({
      windows: [win('a', 1), win('b', 2), win('c', 3, { appId: 'calculator' })],
      activeWorkspace: 1,
    })
    keyOn('keydown', { key: 'Tab', altKey: true })
    expect(container.querySelector('[data-testid="alt-tab-switcher"]')).not.toBeNull()
    keyOn('keydown', { key: 'Tab', altKey: true })
    keyOn('keyup', { key: 'Alt' })
    expect(container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull()
    // MRU from the top (c): one Tab opens on b, the second moves to a.
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('a')
    // The switcher took every one of those keys; the "terminal" saw none.
    expect(termKeys).toEqual([])
  })

  it('takes Escape while open and leaves the target out of it', () => {
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    keyOn('keydown', { key: 'Tab', altKey: true })
    keyOn('keydown', { key: 'Escape', altKey: true })
    expect(container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull()
    expect(termKeys).toEqual([])
    // Closed: the Alt release now belongs to the target again.
    keyOn('keyup', { key: 'Alt' })
    expect(termKeys).toEqual(['keyup:Alt'])
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })

  it('lets Tab without Alt through to the target, unprevented', () => {
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => {
      term.dispatchEvent(ev)
    })
    expect(termKeys).toEqual(['keydown:Tab'])
    expect(ev.defaultPrevented).toBe(false)
    expect(container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull()
  })

  it('lets every key through behind the cover screen', () => {
    useAuthStore.setState({ locked: true })
    useWindowStore.setState({ windows: [win('a', 1), win('b', 2)], activeWorkspace: 1 })
    keyOn('keydown', { key: 'Tab', altKey: true })
    expect(termKeys).toEqual(['keydown:alt+Tab'])
    expect(container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull()
  })
})
