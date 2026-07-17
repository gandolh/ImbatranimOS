import { useCallback, useEffect, useRef, useState } from 'react'

// Below this app-window width the preview pane hides regardless of its
// on/off setting — there just isn't room for tree + list + pane at once.
export const PREVIEW_PANE_COLLAPSE_WIDTH = 640

type PreviewPaneControls = {
  open: boolean
  width: number
  setWidth: (width: number) => void
}

/**
 * Preview-pane splitter wiring: watches the app-window width with a
 * ResizeObserver (to auto-collapse the pane when there isn't room), tracks the
 * live drag state, and runs the hand-attached mouse listeners that grow/shrink
 * the persisted pane width while the handle is dragged.
 *
 * Returns `containerRef` to attach to the outer container, the current
 * `resizing` flag (for the handle's active styling), the derived
 * `previewPaneVisible`, and the `onMouseDown` handler for the splitter handle.
 */
export function usePaneResize(previewPane: PreviewPaneControls) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const previewPaneVisible =
    previewPane.open && (containerWidth === null || containerWidth >= PREVIEW_PANE_COLLAPSE_WIDTH)

  const handlePaneResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = previewPane.width
      setResizing(true)

      function onMove(moveEvent: MouseEvent) {
        // Pane sits to the right of the list; dragging the handle left grows it.
        const delta = startX - moveEvent.clientX
        previewPane.setWidth(startWidth + delta)
      }
      function onUp() {
        setResizing(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [previewPane]
  )

  return { containerRef, resizing, previewPaneVisible, handlePaneResizeStart }
}
