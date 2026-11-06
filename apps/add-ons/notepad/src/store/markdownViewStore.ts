import { useCallback, useState } from 'react'

/**
 * Layout preferences that outlive the window: split ratio, outline rail and scroll
 * sync. Which view a file opens in is not one of them: it follows the file's type.
 *
 * Plain localStorage rather than a persisted store, matching file-manager's
 * `fileViewStore`: three scalar settings do not need more. Every field is validated on read, because the stored value survives
 * upgrades and a removed option must not come back out of storage.
 */

export type MarkdownViewSettings = {
  /** Editor pane's share of the split, 0.2–0.8. */
  splitRatio: number
  outlineOpen: boolean
  syncScroll: boolean
}

const STORAGE_KEY = 'imbatranim:notepad:view'

export const MIN_RATIO = 0.2
export const MAX_RATIO = 0.8

const DEFAULTS: MarkdownViewSettings = {
  splitRatio: 0.5,
  // Off by default: the rail is worth its width on a long document and is dead space on
  // a short one, and the app opens on unknown documents.
  outlineOpen: false,
  syncScroll: true,
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.splitRatio
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

function load(): MarkdownViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<MarkdownViewSettings>
    return {
      splitRatio:
        typeof parsed.splitRatio === 'number' ? clampRatio(parsed.splitRatio) : DEFAULTS.splitRatio,
      outlineOpen:
        typeof parsed.outlineOpen === 'boolean' ? parsed.outlineOpen : DEFAULTS.outlineOpen,
      syncScroll: typeof parsed.syncScroll === 'boolean' ? parsed.syncScroll : DEFAULTS.syncScroll,
    }
  } catch {
    return DEFAULTS
  }
}

function save(settings: MarkdownViewSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A full or blocked storage must not take the editor down with it.
  }
}

export function useMarkdownView() {
  const [settings, setSettings] = useState<MarkdownViewSettings>(load)

  const update = useCallback((patch: Partial<MarkdownViewSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      save(next)
      return next
    })
  }, [])

  /**
   * Move the divider without touching storage.
   *
   * A drag fires a mousemove per frame; persisting each one would write to localStorage
   * sixty times a second. The final ratio is committed on mouse-up.
   */
  const dragRatio = useCallback((ratio: number) => {
    setSettings((prev) => ({ ...prev, splitRatio: clampRatio(ratio) }))
  }, [])

  const commitRatio = useCallback(() => {
    setSettings((prev) => {
      save(prev)
      return prev
    })
  }, [])

  return { settings, update, dragRatio, commitRatio }
}
