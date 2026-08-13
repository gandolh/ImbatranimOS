import { useEffect, useRef } from 'react'
import { createOpenedFileStore, type OpenedFile } from '../store/createOpenedFileStore'
import { useSystem } from './SystemContext'

/** The one-shot open-intent payload a file-backed app is launched with. */
type OpenPayload = { openPath?: string; root?: string }

// ONE module-level opened-file store shared by every window that uses this hook.
// Created exactly once (not per-render, not per-window) so latched files survive
// re-renders and StrictMode remounts.
const useOpenedFileStore = createOpenedFileStore()

/**
 * Drain the one-shot open intent for `windowId` into a per-window store and
 * return the latched file (or null before/without one).
 *
 * The intent is latched exactly once (a local guard drops any later
 * re-delivery), never in a render selector — StrictMode double-renders would
 * otherwise drain it twice. Only latches when both `root` and `openPath` are
 * present. Reads the intent through `system.intents.onOpen` rather than the
 * shell's intent store directly.
 */
export function useOpenIntent(windowId: string): OpenedFile | null {
  const source = useOpenedFileStore((s) => s.fileMap[windowId]) ?? null
  const setFile = useOpenedFileStore((s) => s.setFile)
  const system = useSystem()
  const consumedRef = useRef(false)
  useEffect(() => {
    const off = system.intents.onOpen((payload) => {
      if (consumedRef.current) return
      consumedRef.current = true
      const intent = payload as OpenPayload | undefined
      if (intent?.openPath && intent?.root) {
        setFile(windowId, { root: intent.root, path: intent.openPath })
      }
    })
    return off
  }, [system, windowId, setFile])
  return source
}
