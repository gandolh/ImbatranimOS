import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWindowStore } from '@imbatranim/core'
import { CaptureOverlay } from './components/CaptureOverlay'
import { AnnotationStage } from './components/AnnotationStage'
import { captureRegion } from './capture/rasterize'
import type { Selection } from './types'
import { APP_NAME } from './appName'

type Phase = 'selecting' | 'capturing' | 'annotating'

/**
 * The whole tool lives in a portal over `document.body`; the host window is
 * hidden on mount so its frame never appears in a capture. Flow:
 * trigger → dim + crosshair → drag / Enter → rasterize the live desktop
 * (excluding this overlay + our own taskbar entry) → crop → annotate → exit.
 */
export function SnippingTool({ windowId }: { windowId: string }) {
  const hideWindow = useWindowStore((s) => s.hideWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)

  const [phase, setPhase] = useState<Phase>('selecting')
  const [image, setImage] = useState<HTMLCanvasElement | null>(null)
  const startedRef = useRef(false)

  // Remove the host window from the paint tree before first paint so it is
  // never visible and never lands in the raster.
  useLayoutEffect(() => {
    hideWindow(windowId)
  }, [hideWindow, windowId])

  const close = useCallback(() => closeWindow(windowId), [closeWindow, windowId])

  // Exclude the tool's own chrome from the shot: any overlay we portal in, plus
  // our minimized taskbar button (matched by its title === app name).
  const filterNode = useCallback((node: HTMLElement): boolean => {
    if (!(node instanceof HTMLElement)) return true
    if (node.dataset && 'snipOverlay' in node.dataset) return false
    if (node.tagName === 'BUTTON' && node.getAttribute('title') === APP_NAME) return false
    return true
  }, [])

  const onSelect = useCallback(
    async (sel: Selection) => {
      if (startedRef.current) return
      startedRef.current = true
      setPhase('capturing')
      try {
        const canvas = await captureRegion(sel, filterNode)
        setImage(canvas)
        setPhase('annotating')
      } catch (err) {
        console.error('[snipping-tool] capture failed', err)
        close()
      }
    },
    [filterNode, close]
  )

  let content: React.ReactNode = null
  if (phase === 'selecting') {
    content = <CaptureOverlay onSelect={onSelect} onCancel={close} />
  } else if (phase === 'capturing') {
    content = (
      <div
        data-snip-overlay
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          font: '600 13px "Space Grotesk", sans-serif',
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        Capturing…
      </div>
    )
  } else if (phase === 'annotating' && image) {
    content = <AnnotationStage image={image} onClose={close} />
  }

  return createPortal(content, document.body)
}
