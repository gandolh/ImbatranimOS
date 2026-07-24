import { useEffect } from 'react'
import { Taskbar } from './shared/components/taskbar'
import { Desktop } from './shared/components/desktop'
import { useWallpaperStore } from './shared/store/wallpaperStore'
import { usePaletteStore } from './shared/store/paletteStore'
import { useAppearanceStore, applyAppearance } from './shared/store/appearanceStore'
import { CommandPalette } from './shared/components/CommandPalette'
import { ToastHost } from './shared/components/notifications'
import { useGlobalHotkeys } from './shared/hooks/useGlobalHotkeys'
import { useWindowHotkeys } from './shared/hooks/useWindowHotkeys'
import { usePrefsBoot } from './lib/usePrefsBoot'

export default function App() {
  const wallpaper = useWallpaperStore((s) => s.wallpaper)
  const theme = useAppearanceStore((s) => s.theme)
  const accent = useAppearanceStore((s) => s.accent)
  const paletteOpen = usePaletteStore((s) => s.open)
  const setPaletteOpen = usePaletteStore((s) => s.setOpen)
  const openPalette = usePaletteStore((s) => s.openPalette)

  // Hydrate the server-backed prefs once (this component mounts only after auth
  // is established). Gate the themed shell until it resolves so accent/theme/
  // wallpaper never flash their defaults and then swap.
  const prefsReady = usePrefsBoot()

  // Reflect the active theme + accent onto <html> so the CSS vars resolve. The
  // initial correct values are applied imperatively inside usePrefsBoot before
  // the gate opens; this keeps them in sync with live changes afterwards.
  useEffect(() => {
    applyAppearance(theme, accent)
  }, [theme, accent])

  useGlobalHotkeys({
    'mod+k': () => openPalette(),
  })

  // Keyboard window management (Alt+Tab, Mod+W, Mod+M, Mod+Enter)
  useWindowHotkeys()

  if (!prefsReady) {
    // Neutral placeholder while prefs hydrate — no themed content to flash.
    return <div className="bg-surface h-screen w-screen overflow-hidden" />
  }

  return (
    <div className="bg-surface relative h-screen w-screen overflow-hidden">
      <Desktop wallpaper={wallpaper} />
      <Taskbar />
      {/* Notification toasts (bottom-right, above the taskbar) */}
      <ToastHost />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
