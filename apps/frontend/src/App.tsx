import { useEffect, useState } from 'react'
import { TopBar } from './shared/components/topbar'
import { Desktop } from './shared/components/desktop'
import { useWallpaperStore } from './shared/store/wallpaperStore'
import { useWindowStore } from './shared/store/windowStore'
import { CommandPalette } from './shared/components/CommandPalette'
import { useGlobalHotkeys } from './shared/hooks/useGlobalHotkeys'
import { useWindowHotkeys } from './shared/hooks/useWindowHotkeys'

export default function App() {
  const wallpaper = useWallpaperStore((s) => s.wallpaper)
  const [paletteOpen, setPaletteOpen] = useState(false)

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
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar />
      <Desktop wallpaper={wallpaper} />
      {/* SWARM:S3 command palette mount */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* SWARM:S4 layout restore boot */}
    </div>
  )
}
