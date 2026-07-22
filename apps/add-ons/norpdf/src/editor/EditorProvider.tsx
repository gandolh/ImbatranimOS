/**
 * Holds all PART B editor state and the annotation mutation actions, and
 * provides them via {@link EditorContext}. Mounted inside NorPdf, wrapping the
 * app body, so the annotate toolbar, the per-page overlay, the forms panel and
 * the organize view all share one controller.
 *
 * Re-render contract (from the PART A handoff):
 *  • adding an annotation is an overlay-only preview → `bumpRenderEpoch()`;
 *  • making it (or a form value / page order) show in the rasterised canvas
 *    needs `doc.save()` then `reloadDocument()` — that is {@link syncRaster}.
 * We keep session-added ids in `addedIds` and render only those in the overlay,
 * so a mark never appears twice (once baked, once overlaid).
 */
import { useCallback, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { AnnotationSpec, Color, SignatureMark } from '@pdfcore/engine'
import { useReader } from '../app/context'
import { EditorContext } from './context'
import type { AnnotateTool, EditorController } from './types'

const DEFAULT_COLOR: Color = { r: 0.95, g: 0.72, b: 0.2 } // saffron marker

export function EditorProvider({ children }: { children: ReactNode }): JSX.Element {
  const ctrl = useReader()
  const { doc, reloadDocument } = ctrl

  const [tool, setToolState] = useState<AnnotateTool>('select')
  const [color, setColor] = useState<Color>(DEFAULT_COLOR)
  const [opacity, setOpacity] = useState(1)
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [signMark, setSignMark] = useState<SignatureMark | null>(null)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const [signFieldName, setSignFieldName] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Session-added, not-yet-baked annotation ids. Held as plain state and mutated
  // with functional updates (consecutive synchronous adds accumulate correctly),
  // so no render-phase ref writes are needed.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  // Reset all session state when a different document is opened — the
  // "adjust state on prop change during render" pattern (not an effect).
  const [lastDoc, setLastDoc] = useState(doc)
  if (doc !== lastDoc) {
    setLastDoc(doc)
    setAddedIds(new Set())
    setSelectedId(null)
    setToolState('select')
    setSignMark(null)
  }

  const setTool = useCallback((next: AnnotateTool) => {
    setSelectedId(null)
    setToolState(next)
  }, [])

  const addAnnotation = useCallback(
    (spec: AnnotationSpec): string => {
      if (!doc) return ''
      const id = doc.annotate.add(spec)
      // Overlay-only preview: the mark renders in the SVG overlay, driven by the
      // addedIds change — no raster re-key (which would flash the canvas).
      setAddedIds((prev) => new Set(prev).add(id))
      return id
    },
    [doc]
  )

  const syncRaster = useCallback(async () => {
    if (!doc) return
    setBusy(true)
    try {
      await doc.save()
      await reloadDocument()
      // Everything is baked into the fresh raster now.
      setAddedIds(new Set())
    } finally {
      setBusy(false)
    }
  }, [doc, reloadDocument])

  const deleteAnnotation = useCallback(
    async (id: string) => {
      if (!doc) return
      doc.annotate.delete(id)
      setSelectedId((cur) => (cur === id ? null : cur))
      if (addedIds.has(id)) {
        // Session mark, overlay-only — drop it; the overlay refreshes on the
        // addedIds change.
        setAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        // Already baked into the raster — re-rasterise without it.
        await syncRaster()
      }
    },
    [doc, addedIds, syncRaster]
  )

  const openSignDialog = useCallback(() => {
    setSignFieldName(null)
    setSignDialogOpen(true)
  }, [])
  const openSignDialogForField = useCallback((name: string) => {
    setSignFieldName(name)
    setSignDialogOpen(true)
  }, [])
  const closeSignDialog = useCallback(() => setSignDialogOpen(false), [])

  const applySignatureMark = useCallback(
    (mark: SignatureMark) => {
      setSignDialogOpen(false)
      if (signFieldName && doc) {
        // Fill a specific AcroForm signature field, then bake it into the raster.
        doc.sign.fillSignatureField(signFieldName, mark)
        setSignFieldName(null)
        void syncRaster()
        return
      }
      // Arm the Sign tool: the next drag on a page places the mark.
      setSignMark(mark)
      setTool('sign')
    },
    [doc, signFieldName, syncRaster, setTool]
  )

  const value = useMemo<EditorController>(
    () => ({
      tool,
      setTool,
      color,
      setColor,
      opacity,
      setOpacity,
      strokeWidth,
      setStrokeWidth,
      signMark,
      setSignMark,
      signDialogOpen,
      openSignDialog,
      openSignDialogForField,
      closeSignDialog,
      applySignatureMark,
      selectedId,
      setSelectedId,
      addAnnotation,
      deleteAnnotation,
      addedIds,
      syncRaster,
      busy,
    }),
    [
      tool,
      setTool,
      color,
      opacity,
      strokeWidth,
      signMark,
      signDialogOpen,
      openSignDialog,
      openSignDialogForField,
      closeSignDialog,
      applySignatureMark,
      selectedId,
      addAnnotation,
      deleteAnnotation,
      addedIds,
      syncRaster,
      busy,
    ]
  )

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}
