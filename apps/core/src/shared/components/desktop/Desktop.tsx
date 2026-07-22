import { useCallback, useEffect, useRef } from 'react'
import { DesktopIcon } from './DesktopIcon'
import { APP_REGISTRY } from '../../registry/registry'
import { useEnabledApps } from '../../registry/enabledApps'
import { useWindowStore, TASKBAR_HEIGHT } from '../../store/windowStore'
import { useDesktopStore } from '../../store/desktopStore'
import { ICON_WIDTH, ICON_HEIGHT, GRID_GAP, DESKTOP_PADDING } from '../../../lib/desktopBounds'
import type { Wallpaper } from '../../store/wallpaperStore'
import { WindowContainer } from '../window/WindowContainer'

type DesktopProps = {
  wallpaper: Wallpaper
}

// Theme-aware wallpapers — pattern lines use the active outline token, base uses
// the active surface token, so both light and dark read correctly.
const WALLPAPER_STYLES: Record<Wallpaper, React.CSSProperties> = {
  dots: {
    backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
    backgroundSize: '22px 22px',
    backgroundColor: 'var(--k-surface)',
  },
  grid: {
    backgroundImage:
      'linear-gradient(var(--k-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--k-outline-variant) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    backgroundColor: 'var(--k-surface)',
  },
  linen: {
    backgroundColor: 'var(--k-surface)',
    backgroundImage:
      'radial-gradient(var(--k-outline-variant) 0.5px, transparent 0.5px), radial-gradient(var(--k-outline-variant) 0.5px, var(--k-surface) 0.5px)',
    backgroundSize: '8px 8px',
    backgroundPosition: '0 0, 4px 4px',
  },
}

const PADDING = DESKTOP_PADDING

export function Desktop({ wallpaper }: DesktopProps) {
  const openWindow = useWindowStore((s) => s.openWindow)
  const enabledApps = useEnabledApps()
  const iconPositions = useDesktopStore((s) => s.iconPositions)
  const updateIconPosition = useDesktopStore((s) => s.updateIconPosition)
  const containerRef = useRef<HTMLDivElement>(null)

  // Lay the icon grid out from the LIVE container height (no hardcoded row
  // count) and re-clamp on resize, so no row ever falls under the taskbar.
  // Column-major fill order is preserved; existing (dragged) positions are kept
  // but re-clamped into the current bounds.
  const layoutIcons = useCallback(() => {
    const el = containerRef.current
    const height = el ? el.clientHeight : window.innerHeight - TASKBAR_HEIGHT
    const rowsPerColumn = Math.max(1, Math.floor((height - PADDING) / (ICON_HEIGHT + GRID_GAP)))
    const { iconPositions: positions, updateIconPosition } = useDesktopStore.getState()
    APP_REGISTRY.forEach((app, index) => {
      const existing = positions[app.id]
      if (existing) {
        // updateIconPosition clamps on write — pulls any out-of-bounds icon back in.
        updateIconPosition(app.id, existing)
        return
      }
      const col = Math.floor(index / rowsPerColumn)
      const row = index % rowsPerColumn
      updateIconPosition(app.id, {
        x: PADDING + col * (ICON_WIDTH + GRID_GAP),
        y: PADDING + row * (ICON_HEIGHT + GRID_GAP),
      })
    })
  }, [])

  useEffect(() => {
    layoutIcons()
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => layoutIcons())
    observer.observe(el)
    return () => observer.disconnect()
  }, [layoutIcons])

  function handleOpen(appId: string) {
    const app = APP_REGISTRY.find((a) => a.id === appId)
    if (!app) return
    openWindow(app.id, app.name, app.defaultSize, app.minSize)
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-0 right-0 bottom-[44px] left-0 w-full overflow-hidden"
      style={WALLPAPER_STYLES[wallpaper]}
    >
      {/* Desktop icon container - using absolute positioning for children */}
      <div className="absolute inset-0 p-4">
        {enabledApps
          .filter((app) => app.id !== 'settings')
          .map((app) => {
            const pos = iconPositions[app.id]
            if (!pos) return null
            return (
              <DesktopIcon
                key={app.id}
                app={app}
                onOpen={() => handleOpen(app.id)}
                position={pos}
                onPositionChange={(newPos) => updateIconPosition(app.id, newPos)}
                dragConstraints={containerRef}
              />
            )
          })}
      </div>

      <WindowContainer />
    </div>
  )
}
