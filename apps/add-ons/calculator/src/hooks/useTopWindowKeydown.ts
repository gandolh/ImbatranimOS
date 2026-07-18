import { useEffect, useRef } from 'react'
import { useWindowStore } from '@imbatranim/core'

function isTopWindow(windowId: string): boolean {
  const { windows } = useWindowStore.getState()
  const top = windows.filter((w) => w.isVisible).sort((a, b) => b.zIndex - a.zIndex)[0]
  return top?.id === windowId
}

/**
 * Binds a `keydown` listener (capture phase) that only fires while
 * `windowId` is the top-most visible window — so two calculator windows (or
 * a calculator plus any other app) never fight over keystrokes. Mirrors the
 * scoping pattern core's `useSaveHotkey` uses.
 */
export function useTopWindowKeydown(windowId: string, onKey: (e: KeyboardEvent) => void): void {
  const onKeyRef = useRef(onKey)
  useEffect(() => {
    onKeyRef.current = onKey
  }, [onKey])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!isTopWindow(windowId)) return
      onKeyRef.current(e)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [windowId])
}
