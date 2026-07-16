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
      className="flex flex-col items-center gap-1 cursor-default select-none outline-none w-[64px] absolute top-0 left-0"
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
    >
      {/* Icon box */}
      <div
        className={cn(
          'w-12 h-12 flex items-center justify-center border border-outline-variant',
          'shadow-[inset_-1px_-1px_0_#747780,inset_1px_1px_0_#ffffff]',
          selected ? 'bg-primary-container' : 'bg-surface-container-low'
        )}
      >
        <Icon
          size={20}
          strokeWidth={1.5}
          className={cn(
            selected ? 'text-on-primary-container' : 'text-on-surface-variant'
          )}
        />
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-center leading-tight font-ui',
          'text-[11px] w-full overflow-hidden',
          'line-clamp-2 break-words',
          selected ? 'text-primary' : 'text-on-surface'
        )}
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
      >
        {app.name}
      </span>
    </motion.div>
  )
}
