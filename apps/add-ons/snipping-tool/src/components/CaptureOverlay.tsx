import { useEffect, useRef, useState } from 'react'
import type { Selection } from '../types'

type Props = {
  onSelect: (sel: Selection) => void
  onCancel: () => void
}

type DragState = { startX: number; startY: number; curX: number; curY: number } | null

function normalize(d: NonNullable<DragState>): Selection {
  return {
    x: Math.min(d.startX, d.curX),
    y: Math.min(d.startY, d.curY),
    width: Math.abs(d.curX - d.startX),
    height: Math.abs(d.curY - d.startY),
  }
}

/**
 * Full-viewport capture overlay (flameshot-style): dims the whole desktop,
 * including the taskbar, and lets the user drag a region or press Enter for the
 * full screen. Tagged `data-snip-overlay` so the rasterizer filters it — and
 * the dim it paints — out of the actual shot.
 */
export function CaptureOverlay({ onSelect, onCancel }: Props) {
  const [drag, setDrag] = useState<DragState>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: -1, y: -1 })
  const draggingRef = useRef(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' || (e.key === 'a' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        onSelect({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, onCancel])

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    draggingRef.current = true
    setDrag({ startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY })
  }

  function handlePointerMove(e: React.PointerEvent) {
    setCursor({ x: e.clientX, y: e.clientY })
    if (!draggingRef.current) return
    setDrag((d) => (d ? { ...d, curX: e.clientX, curY: e.clientY } : d))
  }

  function handlePointerUp() {
    draggingRef.current = false
    setDrag((d) => {
      if (!d) return null
      const sel = normalize(d)
      // Ignore stray clicks / tiny drags — keep the overlay up for a real drag.
      if (sel.width < 6 || sel.height < 6) return null
      onSelect(sel)
      return d
    })
  }

  const sel = drag ? normalize(drag) : null

  return (
    <div
      data-snip-overlay
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        cursor: 'crosshair',
        userSelect: 'none',
        touchAction: 'none',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Dim: a full sheet when idle; a box-shadow "hole" once a region exists. */}
      {sel ? (
        <div
          style={{
            position: 'absolute',
            left: sel.x,
            top: sel.y,
            width: sel.width,
            height: sel.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            outline: '1px solid var(--accent, #c0263a)',
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      )}

      {/* Crosshair guide lines while idle (before a drag starts). */}
      {!sel && cursor.x >= 0 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: cursor.y,
              height: 1,
              background: 'rgba(255,255,255,0.55)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: cursor.x,
              width: 1,
              background: 'rgba(255,255,255,0.55)',
            }}
          />
        </>
      )}

      {/* Dimensions badge */}
      {sel && (sel.width > 0 || sel.height > 0) && (
        <div
          style={{
            position: 'absolute',
            left: sel.x,
            top: sel.y > 22 ? sel.y - 22 : sel.y + sel.height + 4,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--accent, #c0263a)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(sel.width)} × {Math.round(sel.height)}
        </div>
      )}

      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(20,20,24,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          whiteSpace: 'nowrap',
        }}
      >
        Drag to select a region &nbsp;·&nbsp; Enter for the whole desktop &nbsp;·&nbsp; Esc to
        cancel
      </div>
    </div>
  )
}
