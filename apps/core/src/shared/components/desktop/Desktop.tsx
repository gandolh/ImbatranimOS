import { useEffect, useRef } from 'react'
import { DesktopIcon } from './DesktopIcon'
import { APP_REGISTRY } from '../../registry/registry'
import { useWindowStore } from '../../store/windowStore'
import { useDesktopStore } from '../../store/desktopStore'
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

const ICON_WIDTH = 64
const ICON_HEIGHT = 80
const GRID_GAP = 16
const PADDING = 16

export function Desktop({ wallpaper }: DesktopProps) {
  const openWindow = useWindowStore((s) => s.openWindow)
  const { iconPositions, updateIconPosition } = useDesktopStore()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize positions if missing
    APP_REGISTRY.forEach((app, index) => {
      if (!iconPositions[app.id]) {
        const col = Math.floor(index / 8)
        const row = index % 8
        updateIconPosition(app.id, {
          x: PADDING + col * (ICON_WIDTH + GRID_GAP),
          y: PADDING + row * (ICON_HEIGHT + GRID_GAP),
        })
      }
    })
  }, [iconPositions, updateIconPosition])

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
        {APP_REGISTRY.filter((app) => app.id !== 'settings').map((app) => {
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
