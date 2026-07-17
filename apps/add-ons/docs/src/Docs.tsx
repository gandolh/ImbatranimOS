import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Save } from 'lucide-react'
import { Button, Tooltip, useIntentStore, useWindowStore } from '@imbatranim/core'
import { fetchFileBytes, uploadFileBytes, UploadTooLargeError } from './api/fileBytes'
import { createDocEngine, type DocEngine } from './engine/superdoc'
import { normalizeDocx } from './engine/docxNormalize'
import { useOpenedFileStore } from './store/openedFileStore'

type OpenPayload = { openPath?: string; root?: string }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function fileName(path: string): string {
  return path.split('/').pop() || 'document.docx'
}

/** True when this window is the top-most visible one (owns global Ctrl+S). */
function isTopWindow(windowId: string): boolean {
  const { windows } = useWindowStore.getState()
  const top = windows.filter((w) => w.isVisible).sort((a, b) => b.zIndex - a.zIndex)[0]
  return top?.id === windowId
}

export function Docs({ windowId }: { windowId: string }) {
  // One-shot open intent → per-window store, drained exactly once in a
  // ref-guarded effect (never in a render selector — StrictMode double-renders).
  const source = useOpenedFileStore((s) => s.fileMap[windowId]) ?? null
  const setFile = useOpenedFileStore((s) => s.setFile)
  const consumedRef = useRef(false)
  useEffect(() => {
    if (consumedRef.current) return
    consumedRef.current = true
    const intent = useIntentStore.getState().consumeIntent(windowId) as OpenPayload | undefined
    if (intent?.openPath && intent?.root) {
      setFile(windowId, { root: intent.root, path: intent.openPath })
    }
  }, [windowId, setFile])

  const editorWrapRef = useRef<HTMLDivElement>(null)
  const toolbarWrapRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DocEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const name = source ? fileName(source.path) : ''

  // Reflect filename + dirty marker in the window title (and taskbar label).
  useEffect(() => {
    if (!source) return
    useWindowStore.getState().updateTitle(windowId, `${name}${dirty ? ' •' : ''}`)
  }, [windowId, name, dirty, source])

  // Warn before closing with unsaved changes. The guard reads a ref so the
  // registered closure always sees the latest dirty state.
  useEffect(() => {
    const store = useWindowStore.getState()
    store.registerCloseGuard(windowId, () => {
      if (!dirtyRef.current) return true
      return window.confirm(
        `"${name || 'This document'}" has unsaved changes. Close without saving?`
      )
    })
    return () => store.unregisterCloseGuard(windowId)
  }, [windowId, name])

  // Boot SuperDoc and load the docx. Each run mounts into FRESH host nodes
  // (not the persistent wrappers) so React StrictMode's mount→cleanup→mount and
  // any future remount never leave two SuperDoc instances fighting over the same
  // DOM — the discarded instance's nodes are removed whole on cleanup, and the
  // surviving instance owns its own untouched nodes (so export reads live edits).
  useEffect(() => {
    if (!source) return
    const editorWrap = editorWrapRef.current
    const toolbarWrap = toolbarWrapRef.current
    if (!editorWrap || !toolbarWrap) return

    const editorHost = document.createElement('div')
    editorHost.style.minHeight = '100%'
    editorWrap.appendChild(editorHost)

    const toolbarHost = document.createElement('div')
    const toolbarId = `docs-toolbar-${windowId}-${Math.random().toString(36).slice(2)}`
    toolbarHost.id = toolbarId
    toolbarWrap.appendChild(toolbarHost)

    let cancelled = false
    let engine: DocEngine | null = null
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const bytes = await fetchFileBytes(source.root, source.path)
        if (cancelled) return
        // Guarantee the parts SuperDoc's exporter needs, so Save actually
        // re-serializes edits instead of silently re-emitting the original.
        const normalized = await normalizeDocx(bytes)
        if (cancelled) return
        const file = new File([normalized as BlobPart], fileName(source.path), { type: DOCX_MIME })
        engine = await createDocEngine({
          editor: editorHost,
          toolbar: `#${toolbarId}`,
          file,
          onReady: () => {
            if (!cancelled) {
              setLoading(false)
              setDirty(false)
            }
          },
          onEdit: () => {
            if (!cancelled) setDirty(true)
          },
          onError: (err) => {
            if (!cancelled) {
              console.error('[docs] document error', err)
              setError('Could not open this document.')
              setLoading(false)
            }
          },
        })
        if (cancelled) {
          engine.destroy()
          return
        }
        engineRef.current = engine
      } catch (err) {
        if (!cancelled) {
          console.error('[docs] failed to open', err)
          setError('Could not open this document.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      engineRef.current = null
      engine?.destroy()
      editorHost.remove()
      toolbarHost.remove()
    }
  }, [source, windowId])

  const handleSave = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || !source || saving) return
    setSaving(true)
    setError(null)
    try {
      const bytes = await engine.exportDocx()
      await uploadFileBytes(source.root, source.path, bytes, fileName(source.path))
      setDirty(false)
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        setError(err.message)
      } else {
        console.error('[docs] failed to save', err)
        setError('Could not save this document.')
      }
    } finally {
      setSaving(false)
    }
  }, [source, saving])

  // Ctrl/Cmd+S saves — but only for the top-most window.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!isTopWindow(windowId)) return
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [windowId, handleSave])

  if (!source) {
    return (
      <div className="bg-surface-container-lowest text-on-surface-variant flex h-full flex-col items-center justify-center gap-2 text-center">
        <FileText size={40} strokeWidth={1} />
        <span className="font-ui text-[12px]">Open a file from Files</span>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* App toolbar (Save) */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-1 border-b px-2 py-1">
        <Tooltip content="Save (Ctrl+S)">
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => void handleSave()}
            disabled={saving || loading || !dirty}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </Button>
        </Tooltip>

        <div className="flex-1" />

        {error && (
          <span className="text-error font-ui mr-2 max-w-[280px] truncate text-[11px]">
            {error}
          </span>
        )}
        <span className="font-ui text-on-surface-variant max-w-[200px] truncate text-[11px]">
          {name}
          {dirty ? ' •' : ''}
        </span>
      </div>

      {/* SuperDoc's own formatting toolbar mounts into a fresh child here. */}
      <div
        ref={toolbarWrapRef}
        className="border-outline-variant bg-surface-container-low border-b"
      />

      {/* Document surface — SuperDoc mounts into a fresh child of this wrapper. */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div ref={editorWrapRef} className="min-h-full" />
        {loading && (
          <div className="bg-surface-container-lowest text-on-surface-variant font-ui absolute inset-0 flex items-center justify-center gap-2 text-[12px]">
            <Loader2 size={16} className="animate-spin" />
            Loading document…
          </div>
        )}
      </div>
    </div>
  )
}
