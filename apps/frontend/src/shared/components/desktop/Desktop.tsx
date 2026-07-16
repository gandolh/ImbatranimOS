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

const WALLPAPER_STYLES: Record<Wallpaper, React.CSSProperties> = {
  dots: {
    backgroundImage: 'radial-gradient(#c3c6d0 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    backgroundColor: '#faf9f8',
  },
  grid: {
    backgroundImage:
      'linear-gradient(#c3c6d0 1px, transparent 1px), linear-gradient(90deg, #c3c6d0 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    backgroundColor: '#faf9f8',
  },
  linen: {
    backgroundColor: '#faf9f8',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23faf9f8'/%3E%3Crect width='1' height='1' x='0' y='0' fill='%23c3c6d0' opacity='0.25'/%3E%3Crect width='1' height='1' x='2' y='2' fill='%23c3c6d0' opacity='0.2'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat',
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
      className="h-[calc(100vh-40px)] w-full relative overflow-hidden mt-[40px]"
      style={WALLPAPER_STYLES[wallpaper]}
    >
      {/* Desktop icon container - using absolute positioning for children */}
      <div className="absolute inset-0 p-4">
        {APP_REGISTRY.filter(app => app.id !== 'settings').map((app) => {
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
