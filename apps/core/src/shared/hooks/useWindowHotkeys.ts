import { useMemo } from 'react'
import { useWindowStore } from '../store/windowStore'
import { useGlobalHotkeys } from './useGlobalHotkeys'

/**
 * Keyboard window management (4c).
 *
 * Shortcut map (chosen to avoid browser conflicts):
 *   Alt+Tab        — cycle focus through visible windows
 *   Mod+W          — close focused window
 *   Mod+M          — hide (minimise) focused window
 *   Mod+Enter      — toggle maximize / restore focused window
 *
 * All actions dispatch through existing windowStore methods.
 */
export function useWindowHotkeys(): void {
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const hideWindow = useWindowStore((s) => s.hideWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const getWindows = () => useWindowStore.getState().windows

  const bindings = useMemo(
    () => ({
      'alt+tab': () => {
        const windows = getWindows()
        const visible = windows.filter((w) => w.isVisible)
        if (visible.length === 0) return
        const maxZ = Math.max(...visible.map((w) => w.zIndex))
        const focused = visible.find((w) => w.zIndex === maxZ)
        const sorted = [...visible].sort((a, b) => a.zIndex - b.zIndex)
        if (!focused) {
          focusWindow(sorted[sorted.length - 1].id)
          return
        }
        const idx = sorted.findIndex((w) => w.id === focused.id)
        const next = sorted[(idx + 1) % sorted.length]
        focusWindow(next.id)
      },

      'mod+w': () => {
        const windows = getWindows()
        const visible = windows.filter((w) => w.isVisible)
        if (visible.length === 0) return
        const maxZ = Math.max(...visible.map((w) => w.zIndex))
        const focused = visible.find((w) => w.zIndex === maxZ)
        if (focused) closeWindow(focused.id)
      },

      'mod+m': () => {
        const windows = getWindows()
        const visible = windows.filter((w) => w.isVisible)
        if (visible.length === 0) return
        const maxZ = Math.max(...visible.map((w) => w.zIndex))
        const focused = visible.find((w) => w.zIndex === maxZ)
        if (focused) hideWindow(focused.id)
      },

      'mod+enter': () => {
        const windows = getWindows()
        const visible = windows.filter((w) => w.isVisible)
        if (visible.length === 0) return
        const maxZ = Math.max(...visible.map((w) => w.zIndex))
        const focused = visible.find((w) => w.zIndex === maxZ)
        if (!focused) return
        if (focused.isMaximized) {
          restoreWindow(focused.id)
        } else {
          maximizeWindow(focused.id)
        }
      },
    }),
    [focusWindow, closeWindow, hideWindow, maximizeWindow, restoreWindow]
  )

  useGlobalHotkeys(bindings)
}
