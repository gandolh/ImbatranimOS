import { useEffect, useRef } from 'react'
import { useIntentStore } from '../store/intentStore'
import { createOpenedFileStore, type OpenedFile } from '../store/createOpenedFileStore'

/** The one-shot open-intent payload an add-on is launched with. */
type OpenPayload = { openPath?: string; root?: string }

// ONE module-level opened-file store shared by every window that uses this hook.
// Created exactly once (not per-render, not per-window) so latched files survive
// re-renders and StrictMode remounts.
const useOpenedFileStore = createOpenedFileStore()

/**
 * Drain the one-shot open intent for `windowId` into a per-window store and
 * return the latched file (or null before/without one).
 *
 * The intent is consumed exactly once in a ref-guarded effect — never in a
 * render selector, because StrictMode double-renders would drain it twice. Only
 * latches when both `root` and `openPath` are present.
 */
export function useOpenIntent(windowId: string): OpenedFile | null {
  const source = useOpenedFileStore((s) => s.fileMap[windowId]) ?? null
  const setFile = useOpenedFileStore((s) => s.setFile)
  const consumedRef = useRef(false)
  useEffect(() => {
    if (consumedRef.current) return
    consumedRef.current = true
    const intent = useIntentStore.getState().consumeIntent(windowId) as OpenPayload | undefined
    if (intent?.openPath && intent?.root) {
      setFile(windowId, { root: intent.root, path: intent.openPath })
    }
  }, [windowId, setFile])
  return source
}
