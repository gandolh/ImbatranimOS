// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { launchLinuxApp } = vi.hoisted(() => ({ launchLinuxApp: vi.fn() }))
vi.mock('../../../modules/linux-windows/launchers', () => ({
  launchLinuxApp,
  linuxLauncherActions: (appId: string) =>
    appId === 'linux:firefox'
      ? [
          { id: 'new-window', name: 'New Window' },
          { id: 'new-private-window', name: 'New Private Window' },
        ]
      : [],
}))
vi.mock('../../registry/enabledApps', () => ({
  useEnabledApps: () => [
    { id: 'linux:firefox', name: 'Firefox', description: 'A Linux app', icon: () => null },
    { id: 'notepad', name: 'Notepad', description: 'Text', icon: () => null },
  ],
}))
vi.mock('../../../lib/recentFiles', () => ({
  useRecentFilesQuery: () => ({ data: [] }),
  clearRecentFiles: vi.fn(),
}))
vi.mock('../brand/Logo', () => ({ Logo: () => null }))

import { StartMenu } from './StartMenu'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Element.prototype.getAnimations ??= () => []

/**
 * A Linux entry in Start offers its desktop actions on right-click (Firefox's
 * New Window), and choosing one starts it the way the entry starts. Other
 * entries keep the browser's own menu.
 */

let container: HTMLDivElement
let root: Root
const onClose = vi.fn()
const onOpenApp = vi.fn()

function entry(appId: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-start-entry="${appId}"]`)!
}

function rightClick(el: HTMLElement): MouseEvent {
  const ev = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 50,
    clientY: 60,
  })
  act(() => {
    el.dispatchEvent(ev)
  })
  return ev
}

const menuItems = () => [
  ...document.querySelectorAll('[role="menu"][aria-label^="Actions for"] [role="menuitem"]'),
]

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  onClose.mockReset()
  onOpenApp.mockReset()
  launchLinuxApp.mockReset()
  await act(async () => {
    root.render(<StartMenu onClose={onClose} onOpenApp={onOpenApp} anchorRef={{ current: null }} />)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("Start's entry menu", () => {
  it("lists a Linux entry's actions after Open", async () => {
    const ev = rightClick(entry('linux:firefox'))
    expect(ev.defaultPrevented).toBe(true)
    await act(async () => {})
    expect(menuItems().map((i) => i.textContent)).toEqual([
      'Open',
      'New Window',
      'New Private Window',
    ])
  })

  it('starts the chosen action, and a press in the menu leaves Start open until then', async () => {
    rightClick(entry('linux:firefox'))
    await act(async () => {})
    const newWindow = menuItems().find((i) => i.textContent === 'New Window') as HTMLElement
    act(() => {
      newWindow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => newWindow.click())
    expect(launchLinuxApp).toHaveBeenCalledExactlyOnceWith('linux:firefox', 'new-window')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens the entry itself from Open', async () => {
    rightClick(entry('linux:firefox'))
    await act(async () => {})
    await act(async () => (menuItems()[0] as HTMLElement).click())
    expect(onOpenApp).toHaveBeenCalledWith('linux:firefox')
    expect(launchLinuxApp).not.toHaveBeenCalled()
  })

  it("leaves an entry without actions to the browser's menu", async () => {
    const ev = rightClick(entry('notepad'))
    await act(async () => {})
    expect(ev.defaultPrevented).toBe(false)
    expect(menuItems()).toEqual([])
  })
})
