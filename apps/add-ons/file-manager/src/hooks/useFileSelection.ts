import { useCallback, useState } from 'react'

/**
 * Multi-select state for the file list.
 *
 * Mirrors the file manager's existing behavior exactly: a plain click replaces
 * the selection (clicking the sole selected row clears it), and ctrl/meta-click
 * toggles a row in/out of the set. There is no shift-range/anchor selection in
 * this app, so none is synthesized here — extraction preserves current behavior.
 *
 * `setSelected` is exposed for the callers that need functional/whole-set
 * updates (keyboard navigation and the delete flow) so their semantics stay
 * byte-for-byte identical to the pre-refactor inline code.
 */
export function useFileSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const select = useCallback((entryPath: string, multi: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (multi) {
        if (next.has(entryPath)) next.delete(entryPath)
        else next.add(entryPath)
      } else {
        if (next.size === 1 && next.has(entryPath)) next.clear()
        else {
          next.clear()
          next.add(entryPath)
        }
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, setSelected, select, clear }
}
