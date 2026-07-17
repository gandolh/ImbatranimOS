import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Save, Sheet as SheetIcon } from 'lucide-react'
import { Button, Tooltip, useIntentStore, useWindowStore } from '@imbatranim/core'
import { fetchFileBytes, uploadFileBytes, UploadTooLargeError } from './api/fileBytes'
import { createSheetEngine, type SheetEngine } from './engine/univer'
import { univerToXlsx, xlsxToUniver } from './engine/xlsxBridge'
import { useOpenedFileStore } from './store/openedFileStore'

type OpenPayload = { openPath?: string; root?: string }

function fileName(path: string): string {
  return path.split('/').pop() || 'workbook.xlsx'
}

/** True when this window is the top-most visible one (owns global Ctrl+S). */
function isTopWindow(windowId: string): boolean {
  const { windows } = useWindowStore.getState()
  const top = windows.filter((w) => w.isVisible).sort((a, b) => b.zIndex - a.zIndex)[0]
  return top?.id === windowId
}

export function Sheets({ windowId }: { windowId: string }) {
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

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SheetEngine | null>(null)
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
        `"${name || 'This workbook'}" has unsaved changes. Close without saving?`
      )
    })
    return () => store.unregisterCloseGuard(windowId)
  }, [windowId, name])

  // Boot Univer, fetch the file, map it through the ExcelJS bridge into the grid.
  useEffect(() => {
    if (!source) return
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let engine: SheetEngine | null = null
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        engine = await createSheetEngine(container)
        if (cancelled) {
          engine.destroy()
          return
        }
        engineRef.current = engine
        engine.onEdit(() => setDirty(true))
        const bytes = await fetchFileBytes(source.root, source.path)
        if (cancelled) return
        const workbookData = await xlsxToUniver(bytes)
        if (cancelled) return
        engine.loadWorkbook(workbookData)
        setDirty(false)
      } catch (err) {
        if (!cancelled) {
          console.error('[sheets] failed to open', err)
          setError('Could not open this spreadsheet.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      engineRef.current = null
      engine?.destroy()
    }
  }, [source])

  const handleSave = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || !source || saving) return
    const snapshot = engine.snapshot()
    if (!snapshot) return
    // Record the edit counter at snapshot time. If the user edits while the
    // serialize+upload is in flight the counter advances, so we must NOT clear
    // dirty on resolve — those edits aren't in the bytes we uploaded.
    const savedAtEditCount = engine.editCount()
    setSaving(true)
    setError(null)
    try {
      const bytes = await univerToXlsx(snapshot)
      await uploadFileBytes(source.root, source.path, bytes, fileName(source.path))
      if (engine.editCount() === savedAtEditCount) setDirty(false)
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        setError(err.message)
      } else {
        console.error('[sheets] failed to save', err)
        setError('Could not save this spreadsheet.')
      }
    } finally {
      setSaving(false)
    }
  }, [source, saving])

  // Ctrl/Cmd+S saves — but only for the top-most window, so multiple open
  // editors don't all fire on one keystroke.
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
        <SheetIcon size={40} strokeWidth={1} />
        <span className="font-ui text-[12px]">Open a file from Files</span>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* Toolbar */}
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

      {/* Grid surface — Univer mounts its canvas here. */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="bg-surface-container-lowest text-on-surface-variant font-ui absolute inset-0 flex items-center justify-center gap-2 text-[12px]">
            <Loader2 size={16} className="animate-spin" />
            Loading spreadsheet…
          </div>
        )}
      </div>
    </div>
  )
}
