import { useEffect, useRef } from 'react'
import { useWindowStore } from '../store/windowStore'

/**
 * Reflect a filename + dirty marker in the window title and warn before closing
 * with unsaved changes.
 *
 * - Retitles the window to `${title}${isDirty ? ' •' : ''}` (skipped while
 *   `title` is empty).
 * - Registers a close guard that reads the LATEST `isDirty` via a ref, so the
 *   registered closure always sees current state; a dirty window prompts with
 *   `window.confirm` and aborts the close on cancel.
 */
export function useUnsavedGuard(windowId: string, isDirty: boolean, title: string): void {
  const dirtyRef = useRef(isDirty)
  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  // Reflect filename + dirty marker in the window title (and taskbar label).
  useEffect(() => {
    if (!title) return
    useWindowStore.getState().updateTitle(windowId, `${title}${isDirty ? ' •' : ''}`)
  }, [windowId, title, isDirty])

  // Warn before closing with unsaved changes. The guard reads a ref so the
  // registered closure always sees the latest dirty state.
  useEffect(() => {
    const store = useWindowStore.getState()
    store.registerCloseGuard(windowId, () => {
      if (!dirtyRef.current) return true
      return window.confirm(
        `"${title || 'This document'}" has unsaved changes. Close without saving?`
      )
    })
    return () => store.unregisterCloseGuard(windowId)
  }, [windowId, title])
}
