import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../../lib/cn'
import type { AppConfig } from '../../registry/registry'

type DesktopIconProps = {
  app: AppConfig
  onOpen: () => void
  position: { x: number; y: number }
  onPositionChange: (pos: { x: number; y: number }) => void
  dragConstraints: React.RefObject<HTMLDivElement | null>
}

export function DesktopIcon({
  app,
  onOpen,
  position,
  onPositionChange,
  dragConstraints,
}: DesktopIconProps) {
  const [selected, setSelected] = useState(false)

  const Icon = app.icon

  function handleClick() {
    setSelected(true)
  }

  function handleDoubleClick() {
    setSelected(false)
    onOpen()
  }

  function handleBlur() {
    setSelected(false)
  }

  return (
    <motion.div
      drag
      dragConstraints={dragConstraints}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={(_, info) => {
        onPositionChange({
          x: position.x + info.offset.x,
          y: position.y + info.offset.y,
        })
      }}
      initial={false}
      animate={{ x: position.x, y: position.y }}
      whileDrag={{ scale: 1.05, zIndex: 10 }}
      className="absolute top-0 left-0 flex w-[64px] cursor-default flex-col items-center gap-1 outline-none select-none"
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
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
