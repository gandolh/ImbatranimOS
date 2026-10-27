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
 * switch moves nothing.
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
