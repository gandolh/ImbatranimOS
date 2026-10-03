// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openApp } from './openApp'
import { useWindowStore } from '../store/windowStore'
import { useIntentStore } from '../store/intentStore'
import { useAddonStore } from '../store/addonStore'

/**
 * Brief 141 — the one launcher every other launcher funnels through.
 *
 * Todo is the fixture because it is single-instance and disableable (Notepad is
 * multi-instance: relaunching it opens a second window, by design).
 */

const todoWindows = () => useWindowStore.getState().windows.filter((w) => w.appId === 'todo')
const win = (id: string) => useWindowStore.getState().windows.find((w) => w.id === id)!

beforeEach(() => {
  useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {}, activeWorkspace: 1 })
  useIntentStore.setState({ intents: new Map() })
  useAddonStore.setState({ disabled: [] })
})

describe('openApp on an open single-instance app', () => {
  it('shows a minimized window, on top, and delivers the intent', () => {
    const id = openApp('todo')
    const other = openApp('calculator')
    useWindowStore.getState().hideWindow(id)
    expect(win(id).isVisible).toBe(false)

    const payload = { openPath: 'lists/today.json', root: 'home' }
    expect(openApp('todo', payload)).toBe(id)

    expect(todoWindows()).toHaveLength(1)
    expect(win(id).isVisible).toBe(true)
    expect(win(id).zIndex).toBeGreaterThan(win(other).zIndex)
    expect(useIntentStore.getState().intents.get(id)).toEqual(payload)
  })

  it('switches to the workspace the window is on', () => {
    const id = openApp('todo')
    useWindowStore.getState().moveWindowToWorkspace(id, 3)
    useWindowStore.getState().setActiveWorkspace(1)

    expect(openApp('todo')).toBe(id)
    expect(useWindowStore.getState().activeWorkspace).toBe(3)
    expect(win(id).isVisible).toBe(true)
  })
})

describe('openApp refusals return an empty id', () => {
  it('an id the registry no longer has', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => openApp('removed-addon', { openPath: 'x', root: 'home' })).not.toThrow()
    expect(openApp('removed-addon')).toBe('')
    expect(useWindowStore.getState().windows).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a disabled add-on', () => {
    useAddonStore.setState({ disabled: ['todo'] })
    expect(openApp('todo')).toBe('')
    expect(useWindowStore.getState().windows).toHaveLength(0)
  })
})
