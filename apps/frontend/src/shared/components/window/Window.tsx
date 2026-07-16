import React, { useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useDrag } from '@use-gesture/react'
import { Minus, Square, X, Copy } from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  useWindowStore,
  type WindowInstance,
  type SnapRegion,
  detectSnapRegion,
  TOPBAR_HEIGHT,
} from '../../store/windowStore'
import { SnapOverlay } from './SnapOverlay'

type ResizeDirection =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'

type WindowProps = {
  instance: WindowInstance
  minSize: { width: number; height: number }
  children: React.ReactNode
  isFocused: boolean
}

type ResizeHandleProps = {
  direction: ResizeDirection
  instanceId: string
  minSize: { width: number; height: number }
}

function ResizeHandle({ direction, instanceId, minSize }: ResizeHandleProps) {
  const updatePosition = useWindowStore((s) => s.updatePosition)
  const updateSize = useWindowStore((s) => s.updateSize)
  const windows = useWindowStore((s) => s.windows)

  const startRef = useRef<{
    x: number
    y: number
    width: number
    height: number
    posX: number
    posY: number
  } | null>(null)

  const bind = useDrag(
    ({ first, movement: [mx, my], event }) => {
      event.stopPropagation()

      const win = windows.find((w) => w.id === instanceId)
      if (!win) return

      if (first) {
        startRef.current = {
          x: 0,
          y: 0,
          width: win.size.width,
          height: win.size.height,
          posX: win.position.x,
          posY: win.position.y,
        }
      }

      const start = startRef.current
      if (!start) return

      const maxW = window.innerWidth - start.posX
      const maxH = window.innerHeight - TOPBAR_HEIGHT - (start.posY - TOPBAR_HEIGHT)

      let newW = start.width
      let newH = start.height
      let newX = start.posX
      let newY = start.posY

      if (direction.includes('e')) {
        newW = Math.max(minSize.width, Math.min(maxW, start.width + mx))
      }
      if (direction.includes('s')) {
        newH = Math.max(minSize.height, Math.min(maxH, start.height + my))
      }
      if (direction.includes('w')) {
        const delta = Math.min(mx, start.width - minSize.width)
        newW = start.width - delta
        newX = start.posX + delta
      }
      if (direction.includes('n')) {
        const minY = TOPBAR_HEIGHT
        const maxDelta = start.posY - minY
        const delta = Math.min(my, start.height - minSize.height)
        const clampedDelta = Math.max(delta, -maxDelta)
        newH = start.height - clampedDelta
        newY = start.posY + clampedDelta
      }

      updateSize(instanceId, { width: newW, height: newH })
      updatePosition(instanceId, { x: newX, y: newY })
    },
    { filterTaps: true },
  )

  const cursorMap: Record<ResizeDirection, string> = {
    n: 'cursor-n-resize',
    s: 'cursor-s-resize',
    e: 'cursor-e-resize',
    w: 'cursor-w-resize',
    ne: 'cursor-ne-resize',
    nw: 'cursor-nw-resize',
    se: 'cursor-se-resize',
    sw: 'cursor-sw-resize',
  }

  const positionClasses: Record<ResizeDirection, string> = {
    n: 'top-0 left-1 right-1 h-1',
    s: 'bottom-0 left-1 right-1 h-1',
    e: 'top-1 right-0 bottom-1 w-1',
    w: 'top-1 left-0 bottom-1 w-1',
    ne: 'top-0 right-0 w-2 h-2',
    nw: 'top-0 left-0 w-2 h-2',
    se: 'bottom-0 right-0 w-2 h-2',
    sw: 'bottom-0 left-0 w-2 h-2',
  }

  return (
    <div
      {...bind()}
      className={cn('absolute z-10', cursorMap[direction], positionClasses[direction])}
      style={{ touchAction: 'none' }}
    />
  )
}

export function Window({ instance, minSize, children, isFocused }: WindowProps) {
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const hideWindow = useWindowStore((s) => s.hideWindow)
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const updatePosition = useWindowStore((s) => s.updatePosition)
  const snapWindow = useWindowStore((s) => s.snapWindow)
  const unsnap = useWindowStore((s) => s.unsnap)

  const dragStartWindowPos = useRef<{ x: number; y: number } | null>(null)
  const [snapPreview, setSnapPreview] = useState<SnapRegion | null>(null)

  const titleBarBind = useDrag(
    ({ first, last, movement: [mx, my], xy: [px, py], event }) => {
      event.stopPropagation()

      if (instance.isMaximized) return

      if (first) {
        dragStartWindowPos.current = { x: instance.position.x, y: instance.position.y }
        focusWindow(instance.id)

        // If currently snapped, unsnap and start dragging from restored position
        if (instance.snapState) {
          unsnap(instance.id)
        }
      }

      const startPos = dragStartWindowPos.current
      if (!startPos) return

      // Move window
      const newX = Math.max(0, Math.min(startPos.x + mx, window.innerWidth - instance.size.width))
      const newY = Math.max(
        TOPBAR_HEIGHT,
        Math.min(startPos.y + my, window.innerHeight - 60),
      )
      updatePosition(instance.id, { x: newX, y: newY })

      // Detect snap region from pointer position
      const detected = detectSnapRegion(px, py)
      setSnapPreview(detected)

      if (last) {
        setSnapPreview(null)
        if (detected) {
          snapWindow(instance.id, detected)
        }
        dragStartWindowPos.current = null
      }
    },
    { filterTaps: true },
  )

  const handleWindowClick = useCallback(() => {
    focusWindow(instance.id)
  }, [focusWindow, instance.id])

  const handleMaximizeToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (instance.isMaximized) {
        restoreWindow(instance.id)
      } else {
        maximizeWindow(instance.id)
      }
    },
    [instance.id, instance.isMaximized, maximizeWindow, restoreWindow],
  )

  const handleHide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      hideWindow(instance.id)
    },
    [hideWindow, instance.id],
  )

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      closeWindow(instance.id)
    },
    [closeWindow, instance.id],
  )

  return (
    <>
      {/* Snap preview overlay — rendered in portal so it covers the full viewport */}
      {snapPreview && createPortal(<SnapOverlay region={snapPreview} />, document.body)}

      <AnimatePresence>
        <motion.div
          key={instance.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          style={{
            position: 'fixed',
            left: instance.position.x,
            top: instance.position.y,
            width: instance.size.width,
            height: instance.size.height,
            zIndex: instance.zIndex,
            display: instance.isVisible ? 'flex' : 'none',
            flexDirection: 'column',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
          className={cn(
            'border border-outline-variant',
            'shadow-[inset_-1px_-1px_0_#747780,inset_1px_1px_0_#ffffff]',
            'overflow-hidden',
          )}
          onClick={handleWindowClick}
        >
          {/* Resize handles — only when not maximized */}
          {!instance.isMaximized && (
            <>
              {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map((dir) => (
                <ResizeHandle
                  key={dir}
                  direction={dir}
                  instanceId={instance.id}
                  minSize={minSize}
                />
              ))}
            </>
          )}

          {/* Title bar */}
          <div
            {...titleBarBind()}
            style={{ touchAction: 'none', userSelect: 'none' }}
            className={cn(
              'flex items-center justify-between px-2 shrink-0 h-[28px]',
              isFocused
                ? 'bg-[#7b9acc] text-[#09315d]'
                : 'bg-[#e9e8e7] text-[#43474f]',
            )}
          >
            {/* Left: title */}
            <span className="text-[13px] font-semibold leading-none truncate pr-2 select-none">
              {instance.title}
            </span>

            {/* Right: window controls */}
            <div className="flex items-center gap-[2px] shrink-0" onClick={(e) => e.stopPropagation()}>
              <TitleBarButton
                onClick={handleHide}
                title="Hide"
                isFocused={isFocused}
              >
                <Minus size={10} strokeWidth={2.5} />
              </TitleBarButton>
              <TitleBarButton
                onClick={handleMaximizeToggle}
                title={instance.isMaximized ? 'Restore' : 'Maximize'}
                isFocused={isFocused}
              >
                {instance.isMaximized ? (
                  <Copy size={10} strokeWidth={2.5} />
                ) : (
                  <Square size={10} strokeWidth={2.5} />
                )}
              </TitleBarButton>
              <TitleBarButton
                onClick={handleClose}
                title="Close"
                isFocused={isFocused}
                isClose
              >
                <X size={10} strokeWidth={2.5} />
              </TitleBarButton>
            </div>
          </div>

          {/* Window body */}
          <div className="flex-1 bg-white overflow-auto min-h-0">
            {children}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

type TitleBarButtonProps = {
  onClick: (e: React.MouseEvent) => void
  title: string
  isFocused: boolean
  isClose?: boolean
  children: React.ReactNode
}

function TitleBarButton({ onClick, title, isFocused, isClose = false, children }: TitleBarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center justify-center w-6 h-6',
        'border-none outline-none cursor-pointer',
        'transition-colors duration-75',
        isFocused
          ? isClose
            ? 'bg-transparent hover:bg-[#09315d]/20 text-[#09315d]'
            : 'bg-transparent hover:bg-[#09315d]/20 text-[#09315d]'
          : 'bg-transparent hover:bg-black/10 text-[#43474f]',
      )}
    >
      {children}
    </button>
  )
}
