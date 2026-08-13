import { useEffect, useRef } from 'react'
import { useSystem } from './SystemContext'

/**
 * Bind Ctrl/⌘+S (capture phase) to `onSave`, but only while this window is the
 * active (top-most visible) window — so a background editor never swallows the
 * save. Active-state is tracked from the compositor's `focus`/`blur` events
 * (which seed synchronously on subscribe), and `onSave` is stored in a ref so
 * the listener always calls the latest callback without re-binding.
 *
 * `_windowId` is retained for call-site compatibility with the pre-seam
 * signature but is no longer needed: the injected handle is already scoped to
 * this window.
 */
export function useSaveHotkey(_windowId: string, onSave: () => void | Promise<void>): void {
  const system = useSystem()
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const isActiveRef = useRef(false)
  useEffect(() => {
    const offFocus = system.on('focus', () => {
      isActiveRef.current = true
    })
    const offBlur = system.on('blur', () => {
      isActiveRef.current = false
    })
    return () => {
      offFocus()
      offBlur()
    }
  }, [system])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!isActiveRef.current) return
        e.preventDefault()
        void onSaveRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
