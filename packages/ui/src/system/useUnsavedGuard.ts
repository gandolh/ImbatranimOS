import { useEffect } from 'react'
import { useSystem } from './SystemContext'

/**
 * Reflect a filename + dirty marker in the window title and warn before closing
 * with unsaved changes.
 *
 * - Retitles the window to `${title}${isDirty ? ' •' : ''}` via
 *   `system.window.setTitle` (skipped while `title` is empty).
 * - Declares the window's dirty state via `system.window.markDirty`; the
 *   compositor owns the confirm-on-close policy, so a dirty window prompts
 *   before discarding on any close path (title-bar box, Ctrl+W, requestClose).
 *
 * `_windowId` is retained for call-site compatibility with the pre-seam
 * signature but is no longer needed: the injected handle is already scoped to
 * this window.
 */
export function useUnsavedGuard(_windowId: string, isDirty: boolean, title: string): void {
  const system = useSystem()

  // Reflect filename + dirty marker in the window title (and taskbar label).
  useEffect(() => {
    if (!title) return
    system.window.setTitle(`${title}${isDirty ? ' •' : ''}`)
  }, [system, title, isDirty])

  // Declare dirty state so the compositor guards the close. Clear the flag on
  // unmount so a closed/replaced editor never leaves a stale veto behind.
  useEffect(() => {
    system.window.markDirty(isDirty)
    return () => system.window.markDirty(false)
  }, [system, isDirty])
}
