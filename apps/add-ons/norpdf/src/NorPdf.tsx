/**
 * norPDF — the reader application (PART A). Top-level composition of the reader
 * shell: owns the shared {@link ReaderController} (via context) and lays out the
 * console, side panel and main area. File I/O (OS open-intent + manual picker +
 * drag-drop) lives here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  PART B MOUNT POINTS (all marked; not built in PART A)
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. Annotate toolbar  → pass a node as `<TopBar toolbarSlot={…} />` (renders a
 *                         second console row, `data-slot="annotate-toolbar"`).
 *  2. Forms panel       → add a tab via `<SidePanel extraTabs={[…]} />`
 *                         ({ id, label, icon: <lucide comp>, render }).
 *  3. Organize view     → render in the `mode === 'organize'` branch of the main
 *                         area (swap out <Reader/>); toggle via `setMode('organize')`.
 *  4. Sign / dialogs    → mount alongside the shell (e.g. a signature dialog),
 *                         driving `doc.sign` then `bumpRenderEpoch()`.
 *  5. Per-page overlay  → PageView marks an annotation-overlay slot keyed to the
 *                         page's `vp` (PageViewport).
 *
 *  After a mutating edit (both actions are on the controller from useReader()):
 *   • in-place annotation add/update/delete → `bumpRenderEpoch()`
 *   • structural change (reorder/insert/delete) or `await doc.save()` →
 *     `await reloadDocument()`
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
// The pdf.js worker: hand the engine the bundled worker URL up front (the
// documented escape hatch). Runs once when this lazy chunk first loads.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { configureWorker } from '@pdfcore/engine'
import {
  fileName,
  installMapGetOrInsert,
  useFileDialog,
  useOpenIntent,
  useSystem,
  useUnsavedGuard,
  type OpenedFile,
} from '@imbatranim/ui'
import { Download, FileText } from 'lucide-react'
import { ReaderContext, useReader } from './app/context'
import { useEditor } from './editor/context'
import { useReaderController } from './app/useReaderController'
import { useReplaceGate, type ReplaceLoad } from './app/useReplaceGate'
import { EmptyState } from './app/EmptyState'
import { TopBar } from './shell/TopBar'
import { SidePanel } from './shell/SidePanel'
import type { SidePanelTab } from './shell/SidePanel'
import { Reader } from './reader/Reader'
import { EditorProvider } from './editor/EditorProvider'
import { AnnotateToolbar } from './editor/AnnotateToolbar'
import { SignatureDialog } from './editor/SignatureDialog'
import { FormsPanel } from './forms/FormsPanel'
import { OrganizeView } from './organize/OrganizeView'
import './norpdf.css'

// pdf.js 6.1 calls Map.prototype.getOrInsertComputed on every render; without
// it every page is blank on Chrome 141 and earlier (brief 91). Installed here,
// at module scope of this lazy chunk, so it is in place before the first render.
installMapGetOrInsert()
configureWorker(workerUrl)

/**
 * The unsaved-close guard, as a component INSIDE both providers: the dialog's
 * Save-and-close button needs the editor's `saveToDisk` (write-back, or a
 * download for a homeless document — either clears dirty), which
 * `useReaderController` itself cannot reach from outside `EditorProvider`.
 */
function UnsavedCloseGuard(): JSX.Element {
  const { dirty, docName } = useReader()
  const { saveToDisk } = useEditor()
  const unsavedDialog = useUnsavedGuard(dirty, docName, saveToDisk)
  return <>{unsavedDialog}</>
}

export function NorPdf({ windowId: _windowId }: { windowId: string }): JSX.Element {
  const ctrl = useReaderController()
  return (
    <ReaderContext.Provider value={ctrl}>
      <EditorProvider>
        <UnsavedCloseGuard />
        <NorPdfShell />
      </EditorProvider>
    </ReaderContext.Provider>
  )
}

/**
 * The shell, INSIDE both providers: every path that replaces the open document
 * goes through `requestReplace`, whose Save button needs the editor's
 * `saveToDisk` (brief 143) — the same reason `UnsavedCloseGuard` lives here.
 */
function NorPdfShell(): JSX.Element {
  const system = useSystem()
  const ctrl = useReader()
  const { saveToDisk } = useEditor()
  const { requestReplace, dialog: replaceDialog } = useReplaceGate(
    ctrl.dirty,
    ctrl.docName,
    saveToDisk
  )
  // One-shot open intent, drained by the shared hook (StrictMode-safe).
  const source = useOpenIntent()
  const [dragging, setDragging] = useState(false)
  const [fetching, setFetching] = useState(false)
  const dragDepth = useRef(0)

  // Ctrl/Cmd+S (write-back Save) is registered in TopBar, which lives inside
  // EditorProvider and can reach the editor's save-and-reload path.

  /* ── Open an OS-provided file ──────────────────────────────────────────── */
  const openBytes = ctrl.openBytes
  const loadSource = useCallback(
    async (file: OpenedFile) => {
      setFetching(true)
      try {
        const buf = await system.fs.read(file.root, file.path)
        // Retain the source as the write-back target: Save writes back here,
        // rather than only offering a download.
        await openBytes(new Uint8Array(buf), fileName(file.path, 'document.pdf'), {
          root: file.root,
          path: file.path,
        })
      } catch (err) {
        system.notify({
          title: 'Could not open PDF',
          body: err instanceof Error ? err.message : String(err),
          level: 'error',
        })
      } finally {
        setFetching(false)
      }
    },
    [openBytes, system]
  )

  // Each latched intent is handled once, whatever the answer: Cancel keeps the
  // current document, and the same intent must not ask again on the next render
  // (`requestReplace` changes identity as nothing else here does, but `dirty`
  // flipping re-runs this effect).
  const handledSource = useRef<OpenedFile | null>(null)
  const latestSource = useRef<OpenedFile | null>(null)
  useEffect(() => {
    latestSource.current = source
    if (!source || handledSource.current === source) return
    handledSource.current = source
    requestReplace(() => loadSource(source))
  }, [source, requestReplace, loadSource])

  /* ── Manual open (OS picker + drag-drop) ───────────────────────────────── */
  // The OS's own Open dialog, browsing the CONTAINER's filesystem. It used to be
  // a native `<input type="file">`, which reads the *host* machine — the one
  // thing brief 54 rules out by name, because "the computer is the container"
  // and a dialog that browses the user's laptop instead of their home directory
  // is actively wrong here. The pick latches into the same store `useOpenIntent`
  // reads, so it runs the identical load path a File Manager double-click does.
  const { openFile: pickFromOs } = useFileDialog()
  const pickFile = useCallback(() => {
    void (async () => {
      const before = latestSource.current
      const choice = await pickFromOs({ extensions: ['pdf'] })
      // Picking the file that is already latched (the open one, or one whose
      // replace was cancelled) does not change the latch, so the effect above
      // never sees it. Ask directly instead.
      if (choice && before && choice.root === before.root && choice.path === before.path) {
        requestReplace(() => loadSource(choice))
      }
    })()
  }, [pickFromOs, requestReplace, loadSource])

  const takeFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return
      const load: ReplaceLoad = () => ctrl.openFile(file)
      requestReplace(load)
    },
    [ctrl, requestReplace]
  )

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }, [])
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = Array.from(e.dataTransfer.files).find(
        (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
      )
      takeFile(file)
    },
    [takeFile]
  )

  // PART B: the Forms side-panel tab (appended to the reader's rail).
  const formsTab: SidePanelTab = {
    id: 'forms',
    label: 'Forms',
    icon: FileText,
    render: () => <FormsPanel />,
  }

  return (
    <>
      {replaceDialog}
      <div
        className="bg-surface-container-lowest relative flex h-full min-h-0 flex-col"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* 1. PART B annotate toolbar mounts via `toolbarSlot` when a doc is open. */}
        <TopBar onOpenClick={pickFile} toolbarSlot={ctrl.doc ? <AnnotateToolbar /> : undefined} />

        <div className="flex min-h-0 flex-1">
          {/* 2. PART B forms tab appends to the side panel via `extraTabs`. */}
          {ctrl.doc && ctrl.panelOpen && <SidePanel extraTabs={[formsTab]} />}

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!ctrl.doc ? (
              <EmptyState
                onOpenClick={pickFile}
                error={ctrl.error}
                loading={ctrl.loading || fetching}
              />
            ) : ctrl.mode === 'organize' ? (
              /* 3. PART B organize view replaces the reader here. */
              <div className="min-h-0 flex-1" data-slot="organize-view">
                <OrganizeView />
              </div>
            ) : (
              <Reader />
            )}
          </main>
        </div>

        {/* 4. PART B: signature capture pad (Sign tool + form signature fields). */}
        <SignatureDialog />

        {dragging && (
          <div
            className="border-primary bg-surface/80 pointer-events-none absolute inset-2 z-50 grid place-items-center border-2 border-dashed backdrop-blur-sm"
            aria-hidden="true"
          >
            <div className="text-on-surface flex flex-col items-center gap-2">
              <Download size={34} strokeWidth={1.5} />
              <p className="font-ui text-[13px]">Drop a PDF to open</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
