import { useEffect, useRef, useState } from 'react'
import { Taskbar } from './shared/components/taskbar'
import { Desktop } from './shared/components/desktop'
import { useWallpaperStore } from './shared/store/wallpaperStore'
import { useWindowStore } from './shared/store/windowStore'
import { useAppearanceStore, applyAppearance } from './shared/store/appearanceStore'
import { CommandPalette } from './shared/components/CommandPalette'
import { useGlobalHotkeys } from './shared/hooks/useGlobalHotkeys'
import { useWindowHotkeys } from './shared/hooks/useWindowHotkeys'

export default function App() {
  const wallpaper = useWallpaperStore((s) => s.wallpaper)
  const theme = useAppearanceStore((s) => s.theme)
  const accent = useAppearanceStore((s) => s.accent)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Reflect the persisted theme + accent onto <html> so the CSS vars resolve.
  useEffect(() => {
    applyAppearance(theme, accent)
  }, [theme, accent])

  useGlobalHotkeys({
    'mod+k': () => setPaletteOpen(true),
  })

  // SWARM:S4 layout restore boot ──────────────────────────────────────────────
  const restoreLayout = useWindowStore((s) => s.restoreLayout)
  const persistLayout = useWindowStore((s) => s.persistLayout)
  const windows = useWindowStore((s) => s.windows)

  // Restore persisted layout on first mount
  useEffect(() => {
    restoreLayout()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist layout whenever windows change. Drag/resize mints a new `windows`
  // array ~60x/sec, so writing synchronously on every change would run a
  // JSON.stringify + localStorage.setItem per frame and jank the drag. Debounce
  // to at most one write per 500ms (trailing). Serialization is unchanged —
  // persistLayout() still writes the exact same schema.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (persistTimer.current !== undefined) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persistTimer.current = undefined
      persistLayout()
    }, 500)

    return () => {
      if (persistTimer.current !== undefined) clearTimeout(persistTimer.current)
    }
  }, [windows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush any pending debounced write when the tab is hidden or unloaded so the
  // final drag/resize position is never lost. Registered once for the app's life.
  useEffect(() => {
    const flush = () => {
      if (persistTimer.current !== undefined) {
        clearTimeout(persistTimer.current)
        persistTimer.current = undefined
      }
      persistLayout()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 4c: keyboard window management (Alt+Tab, Mod+W, Mod+M, Mod+Enter)
  useWindowHotkeys()
  // ── /SWARM:S4 layout restore boot ──────────────────────────────────────────

  return (
    <div className="bg-surface relative h-screen w-screen overflow-hidden">
      <Desktop wallpaper={wallpaper} />
      <Taskbar />
      {/* SWARM:S3 command palette mount */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* SWARM:S4 layout restore boot */}
    </div>
  )
}
