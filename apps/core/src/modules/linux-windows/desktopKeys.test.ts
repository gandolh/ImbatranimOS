// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useShortcutStore } from '../../shared/hooks/shortcutRegistry'
import { isDesktopShortcut } from './desktopKeys'

const key = (code: string, key: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { code, key, ...mods })

describe('the keys the desktop keeps while a Linux app has the keyboard', () => {
  afterEach(() => useShortcutStore.setState({ shortcuts: {} }))

  it('keeps global and window-management shortcuts, ranges included, and gives the app the rest', () => {
    useShortcutStore.getState().register([
      { id: 'p', keys: 'mod+k', description: 'palette', scope: 'Global' },
      { id: 'w', keys: 'ctrl+alt+1…4', description: 'workspaces', scope: 'Window management' },
      { id: 's', keys: 'mod+s', description: 'save', scope: 'Editing' },
    ])
    expect(isDesktopShortcut(key('KeyK', 'k', { ctrlKey: true }))).toBe(true)
    expect(isDesktopShortcut(key('Digit3', '3', { ctrlKey: true, altKey: true }))).toBe(true)
    expect(isDesktopShortcut(key('KeyS', 's', { ctrlKey: true }))).toBe(false)
    expect(isDesktopShortcut(key('KeyC', 'c', { ctrlKey: true }))).toBe(false)
    expect(isDesktopShortcut(key('Escape', 'Escape'))).toBe(false)
  })
})
