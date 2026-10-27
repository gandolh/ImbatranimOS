// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { focusIntoWindowSoon } = vi.hoisted(() => ({ focusIntoWindowSoon: vi.fn() }))
vi.mock('../components/window/focusIntoWindow', () => ({ focusIntoWindowSoon }))
vi.mock('../registry/registry', () => ({
  APP_REGISTRY: [
    {
      id: 'terminal',
      name: 'Terminal',
      multiInstance: false,
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 300, height: 200 },
    },
  ],
}))

import { useWindowStore, type WindowInstance } from '../store/windowStore'
import { appsSource } from './appsSource'

/** Brief 174: the palette bringing up an open app moves the keyboard into it. */

const terminal: WindowInstance = {
  id: 't1',
  appId: 'terminal',
  title: 'Terminal',
  workspaceId: 1,
  isVisible: false,
  isMaximized: false,
  position: { x: 0, y: 0 },
  size: { width: 600, height: 400 },
  zIndex: 1,
}

const item = { id: 'app:terminal', label: 'Terminal', group: 'Apps' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('appsSource.activate (brief 174)', () => {
  it('shows the open window and moves focus into it', () => {
    useWindowStore.setState({ windows: [terminal], activeWorkspace: 1, nextZIndex: 2 })
    appsSource.activate(item)
    expect(useWindowStore.getState().windows[0].isVisible).toBe(true)
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('t1')
  })

  it('leaves a newly opened window to its app', () => {
    useWindowStore.setState({ windows: [], activeWorkspace: 1, nextZIndex: 1 })
    appsSource.activate(item)
    expect(useWindowStore.getState().windows).toHaveLength(1)
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })
})
