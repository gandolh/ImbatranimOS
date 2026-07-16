import { useEffect, useState } from 'react'
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

  // Persist layout whenever windows change
  useEffect(() => {
    persistLayout()
  }, [windows]) // eslint-disable-line react-hooks/exhaustive-deps

  // 4c: keyboard window management (Alt+Tab, Mod+W, Mod+M, Mod+Enter)
  useWindowHotkeys()
  // ── /SWARM:S4 layout restore boot ──────────────────────────────────────────

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-surface">
      <Desktop wallpaper={wallpaper} />
      <Taskbar />
      {/* SWARM:S3 command palette mount */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* SWARM:S4 layout restore boot */}
    </div>
  )
}
