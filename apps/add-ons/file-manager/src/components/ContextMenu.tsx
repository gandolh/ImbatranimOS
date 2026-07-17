import { useEffect, useRef } from 'react'
import { cn } from '@imbatranim/core'

export type ContextMenuItem =
  | {
      type?: 'item'
      label: string
      icon?: React.ReactNode
      onSelect: () => void
      danger?: boolean
      disabled?: boolean
    }
  | { type: 'separator' }

type ContextMenuProps = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/**
 * Bare, cursor-anchored right-click menu. Plain styling — a later reskin brief
 * dresses it. Closes on outside click, scroll, or Escape.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-40 border border-outline-variant bg-surface-container-lowest py-1 shadow-md"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={i} className="my-1 border-t border-outline-variant/50" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1 text-left font-ui text-[12px]',
              item.disabled
                ? 'cursor-not-allowed text-on-surface-variant/50'
                : item.danger
                  ? 'text-error hover:bg-error-container'
                  : 'text-on-surface hover:bg-surface-container',
            )}
          >
            {item.icon && <span className="flex w-3.5 shrink-0 justify-center">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
          </button>
        ),
      )}
    </div>
  )
}
