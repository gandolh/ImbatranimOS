// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useWindowStore, topVisibleWindowId, type WindowInstance } from '../../store/windowStore'
import { useAuthStore } from '../../../modules/auth/store/authStore'
import { Window } from './Window'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Brief 179: a click anywhere in a window raises it, unless that click
 * brought another window to the front (an Open button in Settings →
 * Marketplace), which then stays there.
 */

function win(id: string, z: number, over: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id,
    appId: id,
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

/** Window `a` with one button whose click runs `action`. */
function renderA(action: () => void) {
  act(() =>
    root.render(
      <Window windowId="a" minSize={{ width: 100, height: 100 }} isFocused={false}>
        <p data-testid="body">content</p>
        <button data-testid="open" onClick={action}>
          Open
        </button>
      </Window>
    )
  )
}

const click = (testId: string) => {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
  act(() => el.click())
}

beforeEach(() => {
  useAuthStore.setState({ authenticated: true, everAuthenticated: true, locked: false })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('a click in a window (brief 179)', () => {
  it('leaves an already open window it raised in front', () => {
    useWindowStore.setState({
      windows: [win('a', 2), win('b', 1)],
      nextZIndex: 3,
      activeWorkspace: 1,
    })
    renderA(() => useWindowStore.getState().focusWindow('b'))
    click('open')
    expect(topVisibleWindowId()).toBe('b')
  })

  it('leaves a window it opened in front', () => {
    useWindowStore.setState({ windows: [win('a', 1)], nextZIndex: 2, activeWorkspace: 1 })
    let opened = ''
    renderA(() => {
      opened = useWindowStore
        .getState()
        .openWindow(
          'calculator',
          'Calculator',
          { width: 300, height: 300 },
          { width: 100, height: 100 }
        )
    })
    click('open')
    expect(opened).not.toBe('')
    expect(topVisibleWindowId()).toBe(opened)
  })

  it('raises a background window when its content is clicked', () => {
    useWindowStore.setState({
      windows: [win('a', 1), win('b', 2)],
      nextZIndex: 3,
      activeWorkspace: 1,
    })
    renderA(() => {})
    click('body')
    expect(topVisibleWindowId()).toBe('a')
  })

  it('raises a background window when its button only minimises another', () => {
    // Nothing was brought up: the top changes, but no window was raised.
    useWindowStore.setState({
      windows: [win('a', 1), win('b', 2), win('t', 3)],
      nextZIndex: 4,
      activeWorkspace: 1,
    })
    renderA(() => useWindowStore.getState().hideWindow('t'))
    click('open')
    expect(topVisibleWindowId()).toBe('a')
  })

  it('mints no z for a click in the window already on top', () => {
    useWindowStore.setState({
      windows: [win('a', 2), win('b', 1)],
      nextZIndex: 3,
      activeWorkspace: 1,
    })
    renderA(() => {})
    click('body')
    expect(useWindowStore.getState().nextZIndex).toBe(3)
    expect(topVisibleWindowId()).toBe('a')
  })
})
