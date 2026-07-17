import { useEffect, useRef } from 'react'
import { useWindowStore } from '../store/windowStore'

/** True when this window is the top-most visible one (owns global Ctrl+S). */
function isTopWindow(windowId: string): boolean {
  const { windows } = useWindowStore.getState()
  const top = windows.filter((w) => w.isVisible).sort((a, b) => b.zIndex - a.zIndex)[0]
  return top?.id === windowId
}

/**
 * Bind Ctrl/⌘+S (capture phase) to `onSave`, but only while this window is the
 * top-most visible window. `onSave` is stored in a ref so the listener always
 * calls the latest callback without re-binding.
 */
export function useSaveHotkey(windowId: string, onSave: () => void | Promise<void>): void {
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!isTopWindow(windowId)) return
        e.preventDefault()
        void onSaveRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [windowId])
}
