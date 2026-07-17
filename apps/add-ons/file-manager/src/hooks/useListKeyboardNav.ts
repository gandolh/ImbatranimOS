import { useCallback } from 'react'
import type { FsEntry } from '../types'

type UseListKeyboardNavArgs = {
  orderedEntries: FsEntry[]
  selectedEntries: FsEntry[]
  renamingPath: string | null
  onOpen: (entry: FsEntry) => void
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  /**
   * Brings a row into view by index. Must go through the virtualizer: a row
   * scrolled out of the window is unmounted, so a DOM `scrollIntoView` would
   * find nothing and the focused row would stay off-screen (and unmounted).
   */
  scrollToIndex: (index: number) => void
}

/**
 * ArrowUp/ArrowDown/Enter navigation for the file list. Key handling is
 * unchanged from the inline version: Enter opens a lone selection; arrows move
 * a single-row selection (starting from top/bottom when nothing is selected)
 * and never fire while an inline rename input is focused. After a move it asks
 * the virtualizer to scroll the newly selected index into view.
 */
export function useListKeyboardNav({
  orderedEntries,
  selectedEntries,
  renamingPath,
  onOpen,
  setSelected,
  scrollToIndex,
}: UseListKeyboardNavArgs) {
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
      if (orderedEntries.length === 0) return
      // Editing a name inline — let the input handle its own keys.
      if (renamingPath) return

      if (e.key === 'Enter') {
        if (selectedEntries.length === 1) {
          e.preventDefault()
          onOpen(selectedEntries[0])
        }
        return
      }

      e.preventDefault()
      const currentPath = selectedEntries.length === 1 ? selectedEntries[0].path : null
      const currentIndex = currentPath
        ? orderedEntries.findIndex((en) => en.path === currentPath)
        : -1
      let nextIndex: number
      if (currentIndex === -1) {
        nextIndex = e.key === 'ArrowDown' ? 0 : orderedEntries.length - 1
      } else if (e.key === 'ArrowDown') {
        nextIndex = Math.min(currentIndex + 1, orderedEntries.length - 1)
      } else {
        nextIndex = Math.max(currentIndex - 1, 0)
      }
      const next = orderedEntries[nextIndex]
      setSelected(new Set([next.path]))
      scrollToIndex(nextIndex)
    },
    [orderedEntries, selectedEntries, renamingPath, onOpen, setSelected, scrollToIndex]
  )

  return { handleListKeyDown }
}
