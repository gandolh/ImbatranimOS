import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileCode2, Loader2, Save, X } from 'lucide-react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Button, Tooltip, cn, usePrompt } from '@imbatranim/ui'
import {
  fetchFileBytes,
  fileName,
  notify,
  uploadFileBytes,
  useOpenFilePicker,
  useOpenIntent,
  useSaveHotkey,
  useUnsavedGuard,
  UploadTooLargeError,
} from '@imbatranim/core'
// Side-effect: point @monaco-editor/react at the bundled Monaco and wire the
// same-origin web workers. MUST run before the editor first renders.
import './monacoSetup'
import { FileMenu } from './FileMenu'
import { languageForPath } from './language'
import { useRecentFilesStore, type RecentFile } from './recentFilesStore'

// Types are derived from the OnMount callback so we never deep-import Monaco's
// own type modules here — Monaco stays a runtime-only, lazily-loaded dependency.
type StandaloneEditor = Parameters<OnMount>[0]
type MonacoInstance = Parameters<OnMount>[1]
type TextModel = NonNullable<ReturnType<StandaloneEditor['getModel']>>
type ViewState = ReturnType<StandaloneEditor['saveViewState']>
type Disposable = ReturnType<TextModel['onDidChangeContent']>

type Tab = {
  /** Stable per-file id — also the Monaco model URI. Unique across roots. */
  id: string
  /** Null until a "New" tab has been saved for the first time (untitled). */
  root: string | null
  path: string | null
  name: string
  language: string
}

/** A blank "New" tab's model URI — its own scheme, never collides with `tabId`. */
let untitledCounter = 0
function untitledId(): string {
  untitledCounter += 1
  return `untitled:Untitled-${untitledCounter}`
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/** A Monaco model URI unique per `{root, path}`, valid to `Uri.parse`. */
function tabId(root: string, path: string): string {
  const clean = path.replace(/^\/+/, '')
  return `file:///${encodeURI(root)}/${encodeURI(clean)}`
}

export function CodeEditor({ windowId }: { windowId: string }) {
  // One-shot open intent, drained by the shared hook (StrictMode-safe).
  const source = useOpenIntent(windowId)

  const recent = useRecentFilesStore((s) => s.recent)
  const addRecent = useRecentFilesStore((s) => s.addRecent)
  const removeRecent = useRecentFilesStore((s) => s.removeRecent)
  const clearRecent = useRecentFilesStore((s) => s.clearRecent)
  const { pickFile, filePicker } = useOpenFilePicker()
  const { prompt, promptDialog } = usePrompt()

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editorRef = useRef<StandaloneEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const modelsRef = useRef<Map<string, TextModel>>(new Map())
  const viewStatesRef = useRef<Map<string, ViewState>>(new Map())
  const listenersRef = useRef<Map<string, Disposable>>(new Map())
  // Alternative-version-id captured at last save; drives an undo-aware dirty flag.
  const savedVersionRef = useRef<Map<string, number>>(new Map())
  // Decoded file contents awaiting model creation (once the editor is mounted).
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const openedIdsRef = useRef<Set<string>>(new Set())
  const lastActiveRef = useRef<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeId) ?? null
  const activeName = activeTab?.name ?? ''
  const anyDirty = dirtyIds.size > 0

  // Reflect the active filename + a dirty marker in the window title, and warn
  // before closing while any tab has unsaved changes.
  useUnsavedGuard(windowId, anyDirty, activeName)

  const theme = useMemo(
    () =>
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'vs-dark'
        : 'vs',
    []
  )

  const options = useMemo(
    () => ({
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
    }),
    []
  )

  // Recompute the dirty flag for one tab from its model's alternative version id
  // (so a full undo back to the saved state clears dirty, an edit re-sets it).
  const recomputeDirty = useCallback((id: string) => {
    const model = modelsRef.current.get(id)
    if (!model) return
    const isDirty = model.getAlternativeVersionId() !== savedVersionRef.current.get(id)
    setDirtyIds((prev) => {
      const has = prev.has(id)
      if (has === isDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    // Drop the auto-created empty model; tab models are set on activation.
    const initial = editor.getModel()
    editor.setModel(null)
    initial?.dispose()
    setReady(true)
  }, [])

  // Ensure the active tab has a model, then swap the editor to it while
  // preserving each tab's scroll/cursor (view) state.
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !ready || !activeId) return
    const tab = tabs.find((t) => t.id === activeId)
    if (!tab) return

    let model = modelsRef.current.get(activeId)
    if (!model) {
      const content = pendingContentRef.current.get(activeId) ?? ''
      pendingContentRef.current.delete(activeId)
      model = monaco.editor.createModel(content, tab.language, monaco.Uri.parse(activeId))
      modelsRef.current.set(activeId, model)
      savedVersionRef.current.set(activeId, model.getAlternativeVersionId())
      const created = model
      listenersRef.current.set(
        activeId,
        created.onDidChangeContent(() => recomputeDirty(tab.id))
      )
    }

    const prev = lastActiveRef.current
    if (prev && prev !== activeId) {
      const prevState = editor.saveViewState()
      viewStatesRef.current.set(prev, prevState)
    }
    if (editor.getModel() !== model) {
      editor.setModel(model)
      const saved = viewStatesRef.current.get(activeId)
      if (saved) editor.restoreViewState(saved)
    }
    lastActiveRef.current = activeId
    editor.focus()
  }, [activeId, ready, tabs, recomputeDirty])

  // The one open path every entry point (launch intent, the picker, and the
  // "Open Recent" MRU) funnels through — a file always lands in a new tab
  // exactly like a File-Manager double-click, and every success is an MRU hit.
  const openInTab = useCallback(
    async (root: string, path: string, opts?: { silent?: boolean }): Promise<boolean> => {
      const id = tabId(root, path)
      if (openedIdsRef.current.has(id)) {
        setActiveId(id)
        return true
      }
      openedIdsRef.current.add(id)
      setLoading(true)
      setError(null)
      try {
        const bytes = await fetchFileBytes(root, path)
        pendingContentRef.current.set(id, decoder.decode(bytes))
        const name = fileName(path, 'untitled')
        const tab: Tab = { id, root, path, name, language: languageForPath(path) }
        setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, tab]))
        setActiveId(id)
        addRecent({ root, path, name })
        return true
      } catch (err) {
        openedIdsRef.current.delete(id)
        console.error('[code-editor] failed to open', err)
        if (!opts?.silent) setError('Could not open this file.')
        return false
      } finally {
        setLoading(false)
      }
    },
    [addRecent]
  )

  // Open the file delivered by the launch intent (StrictMode-safe: the
  // `openedIdsRef` guard inside `openInTab` makes a duplicate effect run a no-op).
  useEffect(() => {
    if (!source) return
    ;(async () => {
      await openInTab(source.root, source.path)
    })()
  }, [source, openInTab])

  const handleOpenPicker = useCallback(async () => {
    const file = await pickFile({ title: 'Open file' })
    if (!file) return
    await openInTab(file.root, file.path)
  }, [pickFile, openInTab])

  const handleOpenRecent = useCallback(
    async (entry: RecentFile) => {
      // MRU opens fail silently in the toolbar's error slot — a missing file
      // just drops off the list with a toast instead of a raw error banner.
      const ok = await openInTab(entry.root, entry.path, { silent: true })
      if (!ok) {
        removeRecent(entry.root, entry.path)
        notify({
          title: 'Could not open file',
          body: `"${entry.name}" is no longer available.`,
          appId: 'code-editor',
          level: 'warning',
        })
      }
    },
    [openInTab, removeRecent]
  )

  const handleNew = useCallback(() => {
    const id = untitledId()
    const name = id.slice('untitled:'.length)
    pendingContentRef.current.set(id, '')
    openedIdsRef.current.add(id)
    const tab: Tab = { id, root: null, path: null, name, language: 'plaintext' }
    setTabs((prev) => [...prev, tab])
    setActiveId(id)
  }, [])

  // Dispose every model + listener when the window closes.
  useEffect(() => {
    const models = modelsRef.current
    const listeners = listenersRef.current
    return () => {
      listeners.forEach((d) => d.dispose())
      models.forEach((m) => m.dispose())
      listeners.clear()
      models.clear()
    }
  }, [])

  const handleSave = useCallback(async () => {
    const id = activeId
    const tab = tabs.find((t) => t.id === id)
    const model = id ? modelsRef.current.get(id) : undefined
    if (!id || !tab || !model || saving) return

    // An untitled "New" tab has no destination yet — ask for a filename (same
    // prompt primitive every other add-on uses) and save it into Home.
    let target: { root: string; path: string; name: string }
    if (tab.root != null && tab.path != null) {
      target = { root: tab.root, path: tab.path, name: tab.name }
    } else {
      const entered = await prompt({
        title: 'Save As',
        message: 'Save this file into Home.',
        placeholder: 'untitled.txt',
        initialValue: `${tab.name}.txt`,
        confirmLabel: 'Save',
      })
      const path = entered?.trim().replace(/^\/+/, '')
      if (!path) return
      target = { root: 'home', path, name: fileName(path, path) }
    }

    // Snapshot the version being uploaded; if the user edits mid-flight the
    // version advances and the tab stays dirty (those edits aren't on disk yet).
    const uploadedVersion = model.getAlternativeVersionId()
    const text = model.getValue()
    setSaving(true)
    setError(null)
    try {
      await uploadFileBytes(target.root, target.path, encoder.encode(text), target.name)
      if (tab.root == null || tab.path == null) {
        // Untitled → real file: migrate this tab's identity onto the real
        // path so a later open of the same file recognizes it as already
        // open instead of duplicating the tab/model, and picks up syntax
        // highlighting + an MRU entry.
        const newId = tabId(target.root, target.path)
        const language = languageForPath(target.path)
        const alreadyOpenElsewhere = openedIdsRef.current.has(newId)
        openedIdsRef.current.delete(id)

        if (alreadyOpenElsewhere) {
          // DONE_WITH_CONCERNS: another tab already owns `newId` (this exact
          // file was already open elsewhere). We avoid two tabs fighting
          // over one model id, but this tab keeps its own separate model
          // under the old untitled id — two open buffers for the same file
          // until one tab is closed. Refocusing the existing tab instead
          // would be the ideal fix; left as a follow-up.
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...target, language } : t)))
          recomputeDirty(id)
        } else {
          openedIdsRef.current.add(newId)
          const monaco = monacoRef.current
          if (monaco) {
            // Monaco model URIs are immutable — recreate under the real-file
            // URI (same construction the tab-activation effect uses) and
            // swap the editor onto it so the buffer survives the migration.
            const viewState = editorRef.current?.saveViewState() ?? null
            const newModel = monaco.editor.createModel(
              model.getValue(),
              language,
              monaco.Uri.parse(newId)
            )
            modelsRef.current.set(newId, newModel)
            modelsRef.current.delete(id)

            // Edits made while the upload was in flight advance the old
            // model past `uploadedVersion` — carry that "still dirty" signal
            // to the new model since its version numbering starts fresh.
            const editedMidFlight = model.getAlternativeVersionId() !== uploadedVersion
            savedVersionRef.current.set(
              newId,
              editedMidFlight ? NaN : newModel.getAlternativeVersionId()
            )
            savedVersionRef.current.delete(id)

            listenersRef.current.get(id)?.dispose()
            listenersRef.current.set(
              newId,
              newModel.onDidChangeContent(() => recomputeDirty(newId))
            )
            listenersRef.current.delete(id)
            viewStatesRef.current.delete(id)

            editorRef.current?.setModel(newModel)
            if (viewState) editorRef.current?.restoreViewState(viewState)
            model.dispose()
            lastActiveRef.current = newId
          }

          setActiveId(newId)
          setTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, ...target, id: newId, language } : t))
          )
          recomputeDirty(newId)
        }
        addRecent(target)
      } else {
        savedVersionRef.current.set(id, uploadedVersion)
        recomputeDirty(id)
      }
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        setError(err.message)
      } else {
        console.error('[code-editor] failed to save', err)
        setError('Could not save this file.')
      }
    } finally {
      setSaving(false)
    }
  }, [activeId, tabs, saving, recomputeDirty, prompt, addRecent])

  // Ctrl/Cmd+S saves the active tab — only for the top-most window.
  useSaveHotkey(windowId, handleSave)

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id)
      if (dirtyIds.has(id)) {
        const ok = window.confirm(
          `"${tab?.name ?? 'This file'}" has unsaved changes. Close without saving?`
        )
        if (!ok) return
      }
      listenersRef.current.get(id)?.dispose()
      listenersRef.current.delete(id)
      modelsRef.current.get(id)?.dispose()
      modelsRef.current.delete(id)
      viewStatesRef.current.delete(id)
      savedVersionRef.current.delete(id)
      pendingContentRef.current.delete(id)
      openedIdsRef.current.delete(id)
      if (lastActiveRef.current === id) lastActiveRef.current = null

      const remaining = tabs.filter((t) => t.id !== id)
      setTabs(remaining)
      setDirtyIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (activeId === id) {
        const idx = tabs.findIndex((t) => t.id === id)
        const nextTab = remaining[idx] ?? remaining[idx - 1] ?? null
        setActiveId(nextTab?.id ?? null)
        if (!nextTab) editorRef.current?.setModel(null)
      }
    },
    [tabs, dirtyIds, activeId]
  )

  const hasTabs = tabs.length > 0
  const activeDirty = activeId != null && dirtyIds.has(activeId)

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* App toolbar (File menu + Save) */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-1 border-b px-2 py-1">
        <FileMenu
          recent={recent}
          onNew={handleNew}
          onOpenPicker={() => void handleOpenPicker()}
          onOpenRecent={(entry) => void handleOpenRecent(entry)}
          onClearRecent={clearRecent}
        />
        <Tooltip content="Save (Ctrl+S)">
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={() => void handleSave()}
            disabled={saving || loading || !activeDirty}
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
        <span className="font-ui text-on-surface-variant max-w-[220px] truncate text-[11px]">
          {activeName}
          {activeDirty ? ' •' : ''}
        </span>
      </div>

      {/* Tab strip — one entry per open file (each its own Monaco model). */}
      {hasTabs && (
        <div className="border-outline-variant bg-surface-container-low flex items-stretch gap-px overflow-x-auto border-b">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId
            const isDirty = dirtyIds.has(tab.id)
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onMouseDown={() => setActiveId(tab.id)}
                className={cn(
                  'font-ui group flex max-w-[200px] cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap',
                  isActive
                    ? 'bg-surface-container-lowest text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                )}
                title={tab.path ?? tab.name}
              >
                <span className="truncate">{tab.name}</span>
                <button
                  type="button"
                  aria-label={`Close ${tab.name}`}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className={cn(
                    'hover:bg-surface-container-highest flex h-4 w-4 items-center justify-center rounded-sm',
                    isDirty ? 'text-on-surface' : 'text-on-surface-variant'
                  )}
                >
                  {isDirty ? (
                    <span className="bg-on-surface-variant h-1.5 w-1.5 rounded-full group-hover:hidden" />
                  ) : null}
                  <X size={12} className={cn(isDirty && 'hidden group-hover:block')} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor surface — Monaco is always mounted so its instance is stable;
          an overlay covers it before any file is open. */}
      <div className="relative min-h-0 flex-1">
        <Editor
          theme={theme}
          options={options}
          onMount={handleMount}
          keepCurrentModel
          loading={
            <div className="text-on-surface-variant font-ui flex items-center gap-2 text-[12px]">
              <Loader2 size={16} className="animate-spin" />
              Loading editor…
            </div>
          }
        />

        {loading && (
          <div className="bg-surface-container-lowest text-on-surface-variant font-ui absolute inset-0 flex items-center justify-center gap-2 text-[12px]">
            <Loader2 size={16} className="animate-spin" />
            Loading file…
          </div>
        )}

        {!hasTabs && !loading && (
          <div className="bg-surface-container-lowest text-on-surface-variant absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <FileCode2 size={40} strokeWidth={1} />
            <span className="font-ui text-[12px]">
              Open a code file from Files, or use File → Open…
            </span>
          </div>
        )}
      </div>

      {filePicker}
      {promptDialog}
    </div>
  )
}
