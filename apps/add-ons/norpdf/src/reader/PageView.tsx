/**
 * A single rendered page: the rasterised canvas (Render), the engine's
 * selectable/copyable text layer (`buildTextLayer`) laid over it, and a
 * search-highlight overlay. Only mounted for pages inside the Reader's virtual
 * window, so a large document never eagerly rasterises every page.
 *
 * Coordinate handling:
 *  • `scale` maps PDF points → CSS px (what zoom/fit sets).
 *  • the canvas is rasterised at `scale × devicePixelRatio` for crispness, then
 *    CSS-sized down to `scale` px.
 *  • the text layer + search overlay use the viewport at `scale` so their boxes
 *    align to the CSS-sized canvas.
 *
 * ── PART B SEAM ────────────────────────────────────────────────────────────
 * The `vp` (PageViewport) is available once a page renders; Part B mounts its
 * per-page annotation overlay in the marked slot below, sized to the sheet and
 * driven by the same viewport the text layer uses.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { buildTextLayer, layoutHighlightRects } from '@pdfcore/engine'
import { PageAnnotateLayer } from '../editor/PageAnnotateLayer'
import type {
  DomDocumentLike,
  DomElementLike,
  PageViewport,
  PdfDoc,
  Rect,
  TextHit,
  TextLayerHandle,
} from '@pdfcore/engine'

const MAX_DPR = 2

export interface PageViewProps {
  doc: PdfDoc
  /** 1-based page number. */
  pageNumber: number
  /** CSS px width/height for this page at the current scale (layout box). */
  width: number
  height: number
  /** Points → CSS px scale. */
  scale: number
  /** Bumped by the controller to force a re-render/rebuild after an edit. */
  renderEpoch: number
  /** Search hits located on this page (base highlight). */
  hits: TextHit[]
  /** The rects of the active hit, if it is on this page (focus ring). */
  activeRects: Rect[] | null
  /** Report the page's true (rotation-corrected) point size after first render. */
  onMeasured: (index0: number, w: number, h: number) => void
}

export function PageView({
  doc,
  pageNumber,
  width,
  height,
  scale,
  renderEpoch,
  hits,
  activeRects,
  onMeasured,
}: PageViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textHostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<TextLayerHandle | null>(null)
  // Serialises render.page() calls for this canvas — pdf.js rejects two
  // concurrent render()s onto the same canvas (esp. under StrictMode).
  const renderChain = useRef<Promise<unknown>>(Promise.resolve())
  const [vp, setVp] = useState<PageViewport | null>(null)
  const [failed, setFailed] = useState(false)

  // (Re)render whenever the page, scale, or render epoch changes.
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    const host = textHostRef.current
    if (!canvas || !host) return

    const run = async () => {
      try {
        const viewport = await doc.render.viewport(pageNumber, { scale })
        if (cancelled) return
        setVp(viewport)
        // Report the rotation-corrected point size (viewport px ÷ scale).
        onMeasured(
          pageNumber - 1,
          viewport.width / viewport.scale,
          viewport.height / viewport.scale
        )

        const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
        await doc.render.page(pageNumber, canvas, { scale: scale * dpr })
        if (cancelled) return
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        // Rebuild the selectable text layer aligned to this viewport.
        handleRef.current?.destroy()
        handleRef.current = null
        const items = await doc.text.extract({ pages: [pageNumber] })
        if (cancelled) return
        host.style.width = `${viewport.width}px`
        host.style.height = `${viewport.height}px`
        handleRef.current = buildTextLayer({
          // The engine types these structurally (DomDocumentLike/DomElementLike)
          // to stay free of lib.dom; the real DOM nodes satisfy that surface.
          document: document as unknown as DomDocumentLike,
          container: host as unknown as DomElementLike,
          items,
          viewport,
        })
        setFailed(false)
      } catch (err) {
        if (!cancelled) {
          setFailed(true)
          console.error(`render page ${pageNumber} failed`, err)
        }
      }
    }

    // Chain so this instance never has two overlapping render.page() calls.
    renderChain.current = renderChain.current.then(run, run)

    return () => {
      cancelled = true
      handleRef.current?.destroy()
      handleRef.current = null
    }
  }, [doc, pageNumber, scale, renderEpoch, onMeasured])

  // Base search highlight — drive the engine text layer's highlightRects with
  // every hit on this page.
  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    if (hits.length) {
      const rects = hits.flatMap((h) => h.rects)
      handle.highlightRects(rects)
    } else {
      handle.clearHighlights()
    }
  }, [hits, vp])

  // Active-hit focus ring — rendered as React nodes so it can layer above the
  // base fill. Uses the public layoutHighlightRects helper.
  const activeBoxes = useMemo(() => {
    if (!vp || !activeRects || !activeRects.length) return []
    return layoutHighlightRects(activeRects, vp)
  }, [vp, activeRects])

  return (
    <div className="relative" data-page={pageNumber} style={{ width, height }}>
      <div
        className="ring-outline-variant relative overflow-hidden bg-white shadow-md ring-1"
        style={{ width, height }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block" />
        <div ref={textHostRef} className="pdfcore-text-layer absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden="true">
          {activeBoxes.map((b, i) => (
            <span
              key={i}
              className="norpdf-hit-active absolute"
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
            />
          ))}
        </div>
        {/* PART B: per-page annotation overlay, keyed to the same viewport as the text layer. */}
        {vp && <PageAnnotateLayer page={pageNumber} vp={vp} />}
        {failed && (
          <div className="bg-surface-container text-on-surface-variant absolute inset-0 grid place-items-center text-[12px]">
            Could not render this page.
          </div>
        )}
      </div>
      <span className="text-on-surface-variant absolute right-1 -bottom-5 text-[10px] tabular-nums select-none">
        {pageNumber}
      </span>
    </div>
  )
}
