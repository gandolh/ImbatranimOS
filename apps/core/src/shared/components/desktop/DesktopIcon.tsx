import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../../lib/cn'
import type { AppConfig } from '../../registry/registry'
import { ICON_HEIGHT, ICON_WIDTH, clampToDesktop } from './layoutIcons'

type DesktopIconProps = {
  app: AppConfig
  onOpen: () => void
  position: { x: number; y: number }
  onPositionChange: (pos: { x: number; y: number }) => void
  /**
   * The desktop's measured size. Drag limits are numbers derived from it, not
   * a ref to the desktop element: with a ref, framer-motion listens for window
   * resizes (and observes the element) and on each one stops the icon's
   * running animation and moves it to the same fraction of the new bounds. A
   * resize therefore froze every icon part way to its new grid cell, squeezed
   * together, until a reload (brief 159). Numeric limits have no such listener.
   */
  bounds: { width: number; height: number }
  /**
   * Selection is owned by Desktop (brief 106) — it is a set across icons now
   * (marquee, Ctrl+click), which no per-icon `useState` can express. It is also
   * deliberately ephemeral: the desktop store persists to a dotfile, and a
   * selection surviving a reload would be a bug, not a feature.
   */
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function DesktopIcon({
  app,
  onOpen,
  position,
  onPositionChange,
  bounds,
  selected,
  onSelect,
  onContextMenu,
}: DesktopIconProps) {
  const Icon = app.icon
  // In the x/y motion values' own space: the icon is placed by transform from
  // the desktop's top-left corner. Memoised so a re-render does not hand
  // framer-motion a new object.
  const dragConstraints = useMemo(
    () => ({
      left: 0,
      top: 0,
      right: Math.max(0, bounds.width - ICON_WIDTH),
      bottom: Math.max(0, bounds.height - ICON_HEIGHT),
    }),
    [bounds.width, bounds.height]
  )

  return (
    <motion.div
      drag
      dragConstraints={dragConstraints}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={(_, info) => {
        // Persist the CLAMPED point, not the raw pointer delta. `dragConstraints`
        // only limits what is drawn during the drag; `info.offset` is the full
        // pointer movement, so a flick past the edge would otherwise be stored
        // (and pinned) out of bounds and redraw off-screen, unrecoverable.
        onPositionChange(
          clampToDesktop({ x: position.x + info.offset.x, y: position.y + info.offset.y }, bounds)
        )
      }}
      initial={false}
      animate={{ x: position.x, y: position.y }}
      whileDrag={{ scale: 1.05, zIndex: 10 }}
      className={cn(
        'absolute top-0 left-0 flex w-[64px] cursor-default flex-col items-center gap-1 select-none',
        'focus-visible:ring-primary outline-none focus-visible:ring-2'
      )}
      role="button"
      aria-label={app.name}
      aria-pressed={selected}
      tabIndex={0}
      // Stop the bubble in both directions: a press on an icon must never
      // start the desktop's marquee, and a right-click here opens the ICON
      // menu, not the background one.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e)
      }}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      {/* Icon box */}
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center border transition-colors',
          selected
            ? 'border-primary bg-primary text-on-primary'
            : 'border-outline-variant bg-surface-container-low/80 text-on-surface backdrop-blur-sm'
        )}
      >
        <Icon size={22} strokeWidth={1.5} className="text-current" />
      </div>

      {/* Label */}
      <span
        className={cn(
          'font-ui text-center leading-tight',
          'w-full overflow-hidden px-1 py-0.5 text-[11px]',
          'line-clamp-2 break-words',
          selected
            ? 'bg-primary text-on-primary'
            : 'text-on-surface [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]'
        )}
      >
        {app.name}
      </span>
    </motion.div>
  )
}
