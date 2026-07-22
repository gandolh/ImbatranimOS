import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus, FolderOpen, Loader2, Save, Sheet as SheetIcon } from 'lucide-react'
import {
  Button,
  Tooltip,
  fetchFileBytes,
  uploadFileBytes,
  UploadTooLargeError,
  fileName,
  openApp,
  useOpenFilePicker,
  useOpenIntent,
  usePrompt,
  useSaveHotkey,
  useUnsavedGuard,
  type PickedFile,
} from '@imbatranim/core'
import { createSheetEngine, type SheetEngine } from './engine/univer'
import { univerToXlsx, xlsxToUniver } from './engine/xlsxBridge'

const acceptSpreadsheet = (f: PickedFile) => /\.xlsx?$/i.test(f.name)

export function Sheets({ windowId }: { windowId: string }) {
  // One-shot open intent, drained by the shared hook (StrictMode-safe).
  const source = useOpenIntent(windowId)
  const { pickFile, filePicker } = useOpenFilePicker()
  const { prompt, promptDialog } = usePrompt()

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SheetEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // True once "New" is chosen from the empty state: a blank, editable workbook
  // with no file behind it yet — the first Save prompts for a name.
  const [isNew, setIsNew] = useState(false)
  // The name chosen for a New workbook on its first save. Once set, later
  // saves write straight back to it, same as an opened file.
  const [savedPath, setSavedPath] = useState<{ root: string; path: string } | null>(null)

  const active = source ?? savedPath
  const name = active ? fileName(active.path, 'workbook.xlsx') : 'Untitled Workbook.xlsx'

  async function handleOpen() {
    const file = await pickFile({ title: 'Open spreadsheet', accept: acceptSpreadsheet })
    if (file) openApp('sheets', { root: file.root, openPath: file.path })
  }

  // Reflect filename + dirty marker in the window title and warn before closing
  // with unsaved changes.
  useUnsavedGuard(windowId, dirty, name)

  // Boot Univer, then either fetch+map an opened file through the ExcelJS
  // bridge or, for a New doc, load a blank workbook straight away.
  useEffect(() => {
    if (!source && !isNew) return
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
        if (source) {
          const bytes = await fetchFileBytes(source.root, source.path)
          if (cancelled) return
          const workbookData = await xlsxToUniver(bytes)
          if (cancelled) return
          engine.loadWorkbook(workbookData)
        } else {
          // New doc — Univer fills in sensible defaults for an empty snapshot.
          engine.loadWorkbook({})
        }
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
  }, [source, isNew])

  const handleSave = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || saving) return
    const snapshot = engine.snapshot()
    if (!snapshot) return
    // Record the edit counter at snapshot time. If the user edits while the
    // serialize+upload is in flight the counter advances, so we must NOT clear
    // dirty on resolve — those edits aren't in the bytes we uploaded.
    const savedAtEditCount = engine.editCount()
    let target = active
    if (!target) {
      // A New workbook's first save needs a name — the same themed prompt
      // other core flows use, not a bespoke save-as picker.
      const chosen = await prompt({
        title: 'Save spreadsheet',
        message: 'Name this file to save it.',
        placeholder: 'Untitled Workbook.xlsx',
        initialValue: 'Untitled Workbook.xlsx',
        confirmLabel: 'Save',
      })
      if (!chosen) return
      target = { root: 'home', path: /\.xlsx?$/i.test(chosen) ? chosen : `${chosen}.xlsx` }
    }
    setSaving(true)
    setError(null)
    try {
      const bytes = await univerToXlsx(snapshot)
      await uploadFileBytes(target.root, target.path, bytes, fileName(target.path, 'workbook.xlsx'))
      if (engine.editCount() === savedAtEditCount) setDirty(false)
      if (!active) setSavedPath(target)
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
  }, [active, saving, prompt])

  // Ctrl/Cmd+S saves — but only for the top-most window.
  useSaveHotkey(windowId, handleSave)

  if (!source && !isNew) {
    return (
      <div className="bg-surface-container-lowest text-on-surface-variant flex h-full flex-col items-center justify-center gap-3 text-center">
        <SheetIcon size={40} strokeWidth={1} />
        <span className="font-ui text-[12px]">Open a file from Files</span>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => void handleOpen()}
          >
            <FolderOpen size={12} />
            Open…
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => {
              setIsNew(true)
            }}
          >
            <FilePlus size={12} />
            New
          </Button>
        </div>
        {filePicker}
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
      {promptDialog}
    </div>
  )
}
