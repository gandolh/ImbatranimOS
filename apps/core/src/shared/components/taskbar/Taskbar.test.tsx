// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { focusIntoWindowSoon, openApp } = vi.hoisted(() => ({
  focusIntoWindowSoon: vi.fn(),
  openApp: vi.fn<(appId: string) => string>(),
}))
vi.mock('../window/focusIntoWindow', () => ({ focusIntoWindowSoon }))
vi.mock('../../intents/openApp', () => ({ openApp }))
// The registry is the composition root (every add-on); the taskbar needs it
// only for icons.
vi.mock('../../registry/registry', () => ({ APP_REGISTRY: [] }))
vi.mock('./Tray', () => ({ Tray: () => null }))
vi.mock('./WorkspacePips', () => ({ WorkspacePips: () => null }))
vi.mock('../brand/Logo', () => ({ Logo: () => null }))
// Start renders one item that launches 'notepad', which is enough to drive
// the taskbar's launch path.
vi.mock('./StartMenu', () => ({
  StartMenu: ({ onOpenApp }: { onOpenApp: (appId: string) => void }) => (
    <button onClick={() => onOpenApp('notepad')}>Start: Notepad</button>
  ),
}))

import { useWindowStore, type WindowInstance } from '../../store/windowStore'
import { Taskbar } from './Taskbar'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Brief 174: raising a window from its task button moves the keyboard into it;
 * minimising the focused one leaves the keyboard on the button.
 */

function win(id: string, z: number, over: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id,
    appId: 'notepad',
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

const click = (label: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (b) =>
      b.title === label || b.getAttribute('aria-label') === label || b.textContent?.trim() === label
  )
  if (!button) throw new Error(`No button "${label}" in: ${container.textContent}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useWindowStore.setState({
    windows: [win('a', 1), win('b', 2), win('c', 3, { isVisible: false })],
    activeWorkspace: 1,
    nextZIndex: 4,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Taskbar />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const top = () =>
  useWindowStore
    .getState()
    .windows.filter((w) => w.isVisible)
    .sort((x, y) => y.zIndex - x.zIndex)[0]?.id

describe('Taskbar activation (brief 174)', () => {
  it('raises a background window and moves focus into it', () => {
    click('Window a')
    expect(top()).toBe('a')
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('restores a minimised window and moves focus into it', () => {
    click('Window c')
    const c = useWindowStore.getState().windows.find((w) => w.id === 'c')
    expect(c?.isVisible).toBe(true)
    expect(top()).toBe('c')
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('c')
  })

  it('minimises the focused window and leaves focus where it is', () => {
    click('Window b')
    const b = useWindowStore.getState().windows.find((w) => w.id === 'b')
    expect(b?.isVisible).toBe(false)
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })

  it('moves focus into an open single-instance app that Start brought up', () => {
    openApp.mockReturnValue('a')
    click('Start')
    click('Start: Notepad')
    expect(openApp).toHaveBeenCalledWith('notepad')
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('leaves a window that Start just opened to its app', () => {
    openApp.mockReturnValue('new-window')
    click('Start')
    click('Start: Notepad')
    expect(focusIntoWindowSoon).not.toHaveBeenCalled()
  })
})
