import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  FolderPlus,
  Clipboard,
  Upload,
  Trash2,
  RefreshCw,
  X,
  PanelRight,
  PanelRightClose,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Lock,
  PackageOpen,
} from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  useConfirm,
  usePrompt,
  useSystem,
  useTopWindowKeydown,
} from '@imbatranim/ui'
import { TrashDialog } from './components/TrashDialog'
import { PropertiesDialog } from './components/PropertiesDialog'
import { Input } from '@imbatranim/ui'
import { Dialog } from '@imbatranim/ui'
import { ScrollArea } from '@imbatranim/ui'
import { Tooltip } from '@imbatranim/ui'
import { cn } from '@imbatranim/ui'
import { useVirtualList } from '@imbatranim/ui'
import { useElementSize } from '@imbatranim/ui'
import { Breadcrumb } from './components/Breadcrumb'
import { SearchBox } from './components/SearchBox'
import { SearchResults } from './components/SearchResults'
import { FileList } from './components/FileList'
import { FileGrid } from './components/FileGrid'
import { FolderTree } from './components/FolderTree'
import { UploadDropzone } from './components/UploadDropzone'
import { PreviewPane } from './components/PreviewPane'
import { ContextMenu } from '@imbatranim/ui'
import { FS_ROOTS } from './types'
import type { FsEntry } from './types'
import { resolveOpenApp } from './lib/openWith'
import { OpenWithDialog } from './components/OpenWithDialog'
import { ExtractDialog, type ExtractPrompt } from './components/ExtractDialog'
import { compressPaths, errorMessage } from './api/archiveApi'
import { runExtractJob } from './lib/extractJob'
import {
  archiveKind,
  crumbTarget,
  entryNamesFor,
  folderEntries,
  uniqueArchiveName,
} from './lib/archiveView'
import { buildMenuItems } from './lib/buildMenuItems'
import {
  makeBlankFile,
  uniqueNewFileName,
  newFileOpener,
  type NewFileKind,
} from './lib/newFileTemplates'
import {
  sortEntries,
  filterHidden,
  nextSort,
  gridColumns,
  gridRowCount,
  TILE_HEIGHT,
} from './lib/fileSort'
import { usePreviewPaneSettings } from './store/previewPaneStore'
import { useFileViewSettings } from './store/fileViewStore'
import { parentOf, resultCountLabel, scopeLabel } from './lib/searchPresentation'
import type { SelectMode } from './lib/selectionModel'
import { useFileSearch } from './hooks/useFileSearch'
import { useFileVerbKeys } from './hooks/useFileVerbKeys'
import { useFileSelection } from './hooks/useFileSelection'
import { useFileClipboard } from './hooks/useFileClipboard'
import { useDeleteFlow } from './hooks/useDeleteFlow'
import { usePaneResize } from './hooks/usePaneResize'
import { useListKeyboardNav } from './hooks/useListKeyboardNav'
import {
  useArchiveListingQuery,
  useDirectoryQuery,
  useCreateDirectoryMutation,
  useDeleteEntryMutation,
  useMoveEntryMutation,
  useCopyEntryMutation,
  useWriteContentMutation,
  useUploadFileMutation,
} from './queries/filesQueries'

type MenuState = {
  x: number
  y: number
  entry: FsEntry | null
}

function dirOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

function baseOf(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1)
}

const READ_ONLY_NOTE = 'This is a read-only view of an archive. Extract it to change anything.'

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function FileManager({ windowId: _windowId }: { windowId: string }) {
  const system = useSystem()
  const [root, setRoot] = useState(FS_ROOTS[0].id)
  const rootCfg = FS_ROOTS.find((r) => r.id === root) ?? FS_ROOTS[0]
  const [path, setPath] = useState('')

  // An archive open as a read-only folder: `path` stays the folder the archive
  // sits in, `inner` is where we are inside it.
  const [archive, setArchive] = useState<{ path: string; name: string } | null>(null)
  const [inner, setInner] = useState('')
  const inArchive = archive !== null
  /** The extract dialog's pending request: which archive, and which entries (absent = all). */
  const [extractFor, setExtractFor] = useState<{
    prompt: ExtractPrompt
    archivePath: string
    names?: string[]
  } | null>(null)
  /** The running extraction, for the progress strip. */
  const [job, setJob] = useState<{ label: string; percent: number } | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const queryClient = useQueryClient()

  // Drain a one-shot navigate intent (from the command palette's file search)
  // exactly once — ref-guarded so StrictMode's double-mount can't consume twice.
  // `navigatePath` is separate from the editor apps' `openPath` intent: it moves
  // *this* window to a directory rather than opening a file elsewhere. An empty
  // navigatePath ('') means the root itself, so guard on `!== undefined`.
  const navConsumedRef = useRef(false)
  useEffect(() => {
    if (navConsumedRef.current) return
    navConsumedRef.current = true
    const intent = system.intents.consume<{
      navigatePath?: string
      openPath?: string
      root?: string
    }>()
    // An archive opened from elsewhere (the desktop, a search, Open with) lands
    // here like a double-click on it in its folder.
    const kind = intent?.openPath ? archiveKind(intent.openPath) : null
    // Draining a one-shot open-intent on mount is the intended "sync from an
    // external system" use of an effect; it runs at most once (ref-guarded).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (intent?.openPath && intent.root && kind) {
      const at = intent.openPath
      setRoot(intent.root)
      setPath(dirOf(at))
      if (kind === 'browse') setArchive({ path: at, name: baseOf(at) })
      else
        setExtractFor({
          prompt: { archiveName: baseOf(at), what: 'everything' },
          archivePath: at,
        })
    } else if (intent?.navigatePath !== undefined && intent.root) {
      setRoot(intent.root)
      setPath(intent.navigatePath)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [system])

  // Search state. Ephemeral window state on purpose — a search is a
  // question you are asking right now, not a setting; nothing here belongs in
  // the dotfile.
  const [query, setQuery] = useState('')
  const [contentMode, setContentMode] = useState(false)
  const [selectedHitPath, setSelectedHitPath] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  /** The file whose "Open with" chooser is showing, if any. */
  const [openWithFor, setOpenWithFor] = useState<FsEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Create folder dialog
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Surfaced error for batch delete / upload / create failures.
  const [actionError, setActionError] = useState<string | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [propsEntry, setPropsEntry] = useState<FsEntry | null>(null)

  // Right-click context menu
  const [menu, setMenu] = useState<MenuState | null>(null)

  // File input ref for upload picker
  const fileInputRef = useRef<HTMLInputElement>(null)
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), [])

  // Preview pane: on/off + width persist across sessions; visibility also
  // collapses at small app-window widths regardless of the persisted setting.
  /**
   * Report a failed action once, to both places.
   *
   * The banner alone was not enough — a background File Manager's failed upload or
   * delete is invisible until the user comes back to the window, and the comment
   * here used to say "(no toast system here)" long after `notify()` shipped in
   * Raising the notification *and* keeping the inline banner is
   * deliberate: the notification is what gets noticed, the banner is what stays
   * readable while the user fixes it. One function so the two cannot drift, the
   * same reason `reportFileFailure` exists in core.
   */
  const failAction = useCallback(
    (message: string) => {
      setActionError(message)
      system.notify({ title: 'File Manager', body: message, level: 'error' })
    },
    [system]
  )

  // Sort key/direction, hidden-file visibility and view mode — persisted.
  const view = useFileViewSettings()

  const previewPane = usePreviewPaneSettings()
  const {
    containerRef,
    resizing,
    previewPaneVisible,
    handlePaneResizeStart,
    handlePaneResizeKey,
    handlePaneResizeReset,
    paneMin,
    paneMax,
  } = usePaneResize(previewPane)

  const dirQuery = useDirectoryQuery(root, path)
  const archiveQuery = useArchiveListingQuery(root, archive?.path ?? null)
  const archiveListing = archiveQuery.data
  const archiveEntries = useMemo(
    () => (archiveListing ? folderEntries(archiveListing, inner) : []),
    [archiveListing, inner]
  )
  const createDirMutation = useCreateDirectoryMutation(root, path)
  const writeContentMutation = useWriteContentMutation(root, path)
  const { prompt: promptName, promptDialog } = usePrompt()
  const { confirm, confirmDialog } = useConfirm()
  const deleteMutation = useDeleteEntryMutation(root, path)
  const moveMutation = useMoveEntryMutation(root, path)
  const copyMutation = useCopyEntryMutation(root, path)
  const uploadMutation = useUploadFileMutation(root, path)

  const selection = useFileSelection()
  const { selected, setSelected } = selection
  const clipboard = useFileClipboard({ path, copyMutation, moveMutation, onError: failAction })
  const deleteFlow = useDeleteFlow({
    selected,
    setSelected,
    deleteMutation,
    onError: failAction,
    // Only the home root has a Trash; notes is a separate tree.
    trashEnabled: root === 'home',
    onTrashed: (label, count) =>
      system.notify({
        title: count === 1 ? 'Moved to Trash' : `Moved ${count} items to Trash`,
        body: count === 1 ? label : undefined,
        level: 'info',
      }),
  })

  /**
   * Drop the search and go back to the listing.
   *
   * `contentMode` deliberately survives: it is a mode the user chose, and
   * resetting it under them means the next search silently answers a different
   * question than the last one did. The selection in the listing survives too —
   * Escape must restore the pane exactly as it was.
   */
  function clearSearch() {
    setQuery('')
    setSelectedHitPath(null)
  }

  function switchRoot(nextRoot: string) {
    setRoot(nextRoot)
    setPath('')
    setArchive(null)
    setInner('')
    selection.clear()
    clipboard.clear()
    clearSearch()
  }

  function navigate(nextPath: string) {
    setPath(nextPath)
    setArchive(null)
    setInner('')
    selection.clear()
    // Results are scoped to the folder they were found in; carrying the query
    // across a navigation would silently re-run it somewhere else.
    clearSearch()
  }

  /** Open an archive file like a folder: read-only, from the folder it sits in. */
  function openArchive(entry: FsEntry) {
    setPath(dirOf(entry.path))
    setArchive({ path: entry.path, name: entry.name })
    setInner('')
    selection.clear()
    clearSearch()
  }

  /** The one reply to anything that would change an archive. */
  function blockedInArchive(): boolean {
    if (!inArchive) return false
    setActionError(READ_ONLY_NOTE)
    return true
  }

  /** A handler that does nothing inside an archive but say why. */
  function guarded<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
    return (...args) => {
      if (!blockedInArchive()) fn(...args)
    }
  }

  /** Ask where to extract `names` (absent = everything) from this archive. */
  function askExtract(archivePath: string, archiveName: string, what: string, names?: string[]) {
    if (job) {
      failAction('An extraction is already running.')
      return
    }
    setExtractFor({ prompt: { archiveName, what }, archivePath, names })
  }

  /** Extract from the archive on screen: the entry or selection clicked, else everything. */
  function extractFromView(entry: FsEntry | null) {
    if (!archive || !archiveListing) return
    const targets = entry ? verbTargets(entry) : []
    if (targets.length === 0) {
      askExtract(archive.path, archive.name, 'everything')
      return
    }
    const names = entryNamesFor(
      archiveListing,
      targets.map((t) => t.path)
    )
    askExtract(
      archive.path,
      archive.name,
      targets.length === 1 ? targets[0].name : `${targets.length} items`,
      names
    )
  }

  /**
   * Run the extraction as a polled job. Plain async, not tied to this window:
   * the notification still goes out if Files is closed meanwhile.
   */
  async function runExtract(
    archivePath: string,
    prompt: ExtractPrompt,
    names: string[] | undefined,
    dest: string | undefined
  ) {
    const label = `Extracting ${prompt.what} from ${prompt.archiveName}`
    setJob({ label, percent: 0 })
    try {
      const result = await runExtractJob(
        system.http,
        { root, path: archivePath, dest, entries: names },
        (percent) => {
          if (mountedRef.current) setJob({ label, percent })
        }
      )
      system.notify({
        title: 'Extraction complete',
        body: `${prompt.archiveName} → ${result.dest}`,
        level: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['fs-list'] })
    } catch (err) {
      const message = `Could not extract ${prompt.archiveName}: ${errorMessage(err)}`
      system.notify({ title: 'File Manager', body: message, level: 'error' })
      if (mountedRef.current) setActionError(message)
    } finally {
      if (mountedRef.current) setJob(null)
    }
  }

  /** A folder crumb inside an archive: out of it, or up and down within it. */
  function handleCrumb(clicked: string) {
    if (!archive) {
      navigate(clicked)
      return
    }
    const target = crumbTarget(archive.path, clicked)
    if (target.leave) {
      navigate(target.path)
      return
    }
    setInner(target.inner)
    selection.clear()
  }

  function handleOpen(entry: FsEntry) {
    if (inArchive) {
      // Nothing inside an archive opens in place: folders are walked, and a
      // file is offered for extraction.
      if (entry.type === 'directory') {
        setInner(entry.path)
        selection.clear()
      } else extractFromView(entry)
      return
    }
    if (entry.type === 'directory') {
      navigate(entry.path)
      return
    }
    const kind = archiveKind(entry.name)
    if (kind === 'browse') {
      openArchive(entry)
      return
    }
    if (kind === 'extract') {
      // A lone .gz or .xz has no folder to show.
      askExtract(entry.path, entry.name, 'everything')
      return
    }
    // Routing goes through the handle's association registry: the
    // user's choice, then whichever app declares the type, then a text fallback.
    const appId = resolveOpenApp(system.intents.associations, root, entry.name)
    if (appId) {
      // openApp records the OS-wide recent at the choke point — an
      // app cannot attribute a recent to another app any more, so the shell does.
      system.intents.openApp(appId, { openPath: entry.path, root })
      return
    }
    // Nothing claims it and it is not text — an unknown binary. Ask, rather
    // than swallowing the click, which is what this did for every unmapped
    // extension before default apps and Open with and is the single worst thing an OS can do to
    // a double-click.
    setOpenWithFor(entry)
  }

  /** Open one file with a specific app, and remember the choice if asked. */
  function openEntryWith(entry: FsEntry, appId: string) {
    system.intents.openApp(appId, { openPath: entry.path, root })
  }

  function handleRename(entry: FsEntry) {
    if (blockedInArchive()) return
    setRenamingPath(entry.path)
    setRenameValue(entry.name)
  }

  function handleRenameCommit() {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null)
      return
    }
    const trimmed = renameValue.trim()
    const dir = renamingPath.includes('/')
      ? renamingPath.substring(0, renamingPath.lastIndexOf('/'))
      : ''
    // Same guards as handleNewFile: a filename, not a path, and not already taken
    // in this directory. Rename had neither check nor any error feedback (M4).
    if (/[\\/]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
      failAction('That name is not a valid filename.')
      setRenamingPath(null)
      return
    }
    const newPath = dir ? `${dir}/${trimmed}` : trimmed
    if (newPath === renamingPath) {
      setRenamingPath(null)
      return
    }
    if ((dirQuery.data ?? []).some((e) => e.name === trimmed && e.path !== renamingPath)) {
      failAction(`"${trimmed}" already exists here.`)
      setRenamingPath(null)
      return
    }
    moveMutation.mutate(
      { from: renamingPath, to: newPath },
      { onError: () => failAction(`Could not rename to "${trimmed}".`) }
    )
    setRenamingPath(null)
  }

  function handleCreateFolder() {
    if (!newFolderName.trim()) return
    createDirMutation.mutate(newFolderName.trim(), {
      onSuccess: () => {
        setShowNewFolder(false)
        setNewFolderName('')
      },
    })
  }

  async function handleNewFile() {
    if (blockedInArchive()) return
    const name = await promptName({
      title: 'New file',
      message: 'Include the extension — it decides which app opens the file.',
      placeholder: 'notes.md',
    })
    if (!name) return
    const trimmed = name.trim()
    // A filename, not a path: the backend jails this anyway, but refusing here
    // gives a real message instead of a 400.
    if (!trimmed || /[\\/]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
      failAction('That name is not a valid filename.')
      return
    }
    if ((dirQuery.data ?? []).some((e) => e.name === trimmed)) {
      failAction(`"${trimmed}" already exists here.`)
      return
    }
    const filePath = path ? `${path}/${trimmed}` : trimmed
    writeContentMutation.mutate(
      { path: filePath, content: '' },
      {
        onSuccess: () =>
          handleOpen({ name: trimmed, path: filePath, type: 'file', size: 0, modifiedAt: '' }),
        onError: () => failAction(`Could not create "${trimmed}".`),
      }
    )
  }

  function handleNewOfficeFile(kind: NewFileKind) {
    if (blockedInArchive()) return
    // Born in the file manager: write a blank template at the current directory
    // under a non-colliding name, then open it straight into the editor.
    const existing = (dirQuery.data ?? []).map((e) => e.name)
    const name = uniqueNewFileName(kind, existing)
    const filePath = path ? `${path}/${name}` : name
    const file = makeBlankFile(kind, name)
    uploadMutation.mutate(
      { path: filePath, file },
      {
        onSuccess: () => {
          // The menu offers the kind only while some app opens it.
          const appId = newFileOpener(system.intents.associations, kind)
          if (appId) system.intents.openApp(appId, { openPath: filePath, root })
        },
      }
    )
  }

  async function handleUploadFiles(files: File[]) {
    if (blockedInArchive()) return
    // Never silently overwrite: an upload (or a drag-drop) whose name already
    // exists here used to clobber the file on disk with no warning (M5). Ask
    // before replacing; if declined, upload only the names that collide with
    // nothing and skip the rest.
    const existing = new Set((dirQuery.data ?? []).map((e) => e.name))
    const clashes = files.filter((f) => existing.has(f.name))
    let toUpload = files
    if (clashes.length > 0) {
      const ok = await confirm({
        title: clashes.length === 1 ? 'Replace file?' : 'Replace files?',
        message:
          clashes.length === 1
            ? `"${clashes[0].name}" already exists here. Uploading replaces it.`
            : `${clashes.length} files already exist here and will be replaced: ${clashes
                .map((f) => f.name)
                .join(', ')}.`,
        destructive: true,
        confirmLabel: 'Replace',
      })
      if (!ok) {
        toUpload = files.filter((f) => !existing.has(f.name))
        if (toUpload.length === 0) return
      }
    }
    const results = await Promise.allSettled(
      toUpload.map((file) => {
        const filePath = path ? `${path}/${file.name}` : file.name
        return uploadMutation.mutateAsync({ path: filePath, file })
      })
    )
    const failed = toUpload.filter((_, i) => results[i].status === 'rejected')
    if (failed.length > 0) {
      failAction(
        `Failed to upload ${failed.length} file${failed.length !== 1 ? 's' : ''}: ${failed
          .map((f) => f.name)
          .join(', ')}.`
      )
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) {
      handleUploadFiles(Array.from(files))
      e.target.value = ''
    }
  }

  /**
   * Which entries a row verb acts on: the whole selection when the clicked row
   * is part of a multi-selection, otherwise just that row. The `onCompress`
   * precedent — a menu item that silently acted on one of five selected files
   * would be a trap, and Ctrl+C has exactly the same problem.
   */
  /**
   * A row click, with the mode the modifiers asked for. The ordered paths go
   * in because a range is only meaningful against the order on screen — the
   * filtered, sorted `orderedEntries`, never the raw query data.
   */
  function selectRow(entryPath: string, mode: SelectMode) {
    selection.select(
      entryPath,
      mode,
      orderedEntries.map((en) => en.path)
    )
  }

  function verbTargets(entry: FsEntry): FsEntry[] {
    return selected.has(entry.path) && selectedEntries.length > 1 ? selectedEntries : [entry]
  }

  function openEntryMenu(entry: FsEntry, e: React.MouseEvent) {
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function openBackgroundMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry: null })
  }

  // `openFilePicker` reads fileInputRef, but only when the Upload item is
  // clicked (an event handler) — never during render. react-hooks/refs can't
  // see that through buildMenuItems, so its warning here is a false positive.
  /* eslint-disable react-hooks/refs */
  const menuItems = menu
    ? buildMenuItems({
        entry: menu.entry,
        root,
        assoc: system.intents.associations,
        hasClipboard: !!clipboard.clipboard,
        onOpen: handleOpen,
        onOpenWith: (entry: FsEntry) => setOpenWithFor(entry),
        onDownload: (entry) => triggerDownload(system.fs.downloadUrl(root, entry.path), entry.name),
        onRename: handleRename,
        onCopy: (entry) => clipboard.copy(verbTargets(entry)),
        onCut: (entry) => clipboard.cut(verbTargets(entry)),
        // Read from the `selected` SET, not from `verbTargets`: this runs during
        // render, and `selectedEntries` is derived further down the body — calling
        // through to it here threw a TDZ error the instant the menu opened, which
        // is a crash you only see with the menu on screen.
        verbCount: menu.entry && selected.has(menu.entry.path) ? Math.max(1, selected.size) : 1,
        onDelete: deleteFlow.requestSingle,
        onNewFile: () => void handleNewFile(),
        onNewFolder: () => setShowNewFolder(true),
        onProperties: (entry) => setPropsEntry(entry),
        onNewOfficeFile: handleNewOfficeFile,
        onUpload: openFilePicker,
        onPaste: clipboard.paste,
        onRefresh: () => (inArchive ? archiveQuery.refetch() : dirQuery.refetch()),
        inArchive,
        onExtractAll: () => extractFromView(null),
        onExtract: (entry) =>
          inArchive ? extractFromView(entry) : askExtract(entry.path, entry.name, 'everything'),
        onEditInPaint: (entry) => {
          system.intents.openApp('paint', { openPath: entry.path, root })
        },
        onCompare: (() => {
          // Exactly two files selected, the clicked entry one of them — the
          // only state where "Compare" can mean something.
          if (!menu.entry || menu.entry.type !== 'file') return null
          if (selected.size !== 2 || !selected.has(menu.entry.path)) return null
          const files = (dirQuery.data ?? []).filter(
            (e) => selected.has(e.path) && e.type === 'file'
          )
          if (files.length !== 2) return null
          return () =>
            system.intents.openApp('diff', {
              leftRoot: root,
              leftPath: files[0].path,
              rightRoot: root,
              rightPath: files[1].path,
            })
        })(),
        onCompress: (entry) => {
          const paths =
            selected.has(entry.path) && selected.size > 1
              ? orderedEntries.filter((e) => selected.has(e.path)).map((e) => e.path)
              : [entry.path]
          void handleCompress(paths, paths.length > 1 ? 'archive' : entry.name)
        },
      })
    : []
  /* eslint-enable react-hooks/refs */

  /** Pack these paths into a new .zip in the folder on screen, beside what is there. */
  async function handleCompress(paths: string[], base: string) {
    const name = uniqueArchiveName(
      base,
      (dirQuery.data ?? []).map((e) => e.name)
    )
    const dest = path ? `${path}/${name}` : name
    try {
      const res = await compressPaths(system.http, root, paths, dest, 'zip')
      system.notify({
        title: 'Archive created',
        body: `${res.entries} file${res.entries === 1 ? '' : 's'} → ${res.dest}`,
        level: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['fs-list'] })
    } catch (err) {
      failAction(`Could not create ${name}: ${errorMessage(err)}`)
    }
  }

  const entries = inArchive ? archiveEntries : (dirQuery.data ?? [])
  const isLoading = inArchive ? archiveQuery.isLoading : dirQuery.isLoading
  const isError = inArchive ? archiveQuery.isError : dirQuery.isError

  // Filter, then sort, ONCE — and pass the result down. FileList used to re-sort
  // internally with its own call, which happened to agree only because both used
  // the same fixed comparator; the moment sorting became user-controlled, two
  // independent sorts would have let arrow-key movement disagree with what is on
  // screen. `orderedEntries` is now the single order for the virtualizer, keyboard
  // nav, selection and the rendering.
  const visibleEntries = filterHidden(entries, view.showHidden)
  const orderedEntries = sortEntries(visibleEntries, view.sort.key, view.sort.dir)
  const selectedEntries = orderedEntries.filter((e) => selected.has(e.path))
  const hiddenCount = entries.length - visibleEntries.length

  // One name for one entry, a count for many — the clipboard went multi-entry
  // in file manager keyboard parity and both the toolbar badge and the status bar read from here.
  const clipboardLabel = clipboard.clipboard
    ? clipboard.clipboard.entries.length === 1
      ? clipboard.clipboard.entries[0].name
      : `${clipboard.clipboard.entries.length} items`
    : ''

  // ── Search ──────────────────────────────────────────────────────
  const searchActive = !inArchive && query.trim().length > 0
  const search = useFileSearch(root, path, query, contentMode)

  /**
   * Open a hit through the same door as a listing row.
   *
   * A `SearchHit` is `{ name, path, type }` — the route cannot return a size or
   * an mtime — so it is widened into an `FsEntry` exactly the way `handleNewFile`
   * widens a freshly created file. That keeps files routing through the brief-81
   * association registry (not a hardcoded editor) and lets a directory hit
   * navigate this window, which clears the search on its way through.
   */
  function openHit(hit: { name: string; path: string; type: 'file' | 'directory' }) {
    handleOpen({ ...hit, size: 0, modifiedAt: '' })
  }

  /**
   * The real entry behind the selected hit, for the preview pane.
   *
   * A synthesized `size: 0, modifiedAt: ''` is fine for *opening* a file — the
   * open path only reads name/path/type — but the preview pane renders both,
   * and would confidently report "0 B, Modified Invalid Date". So look the hit
   * up in its own parent listing instead. When nothing is selected this asks for
   * the directory already on screen, which is the same query key `dirQuery`
   * uses: no extra request in the common case.
   */
  const hitParentPath = selectedHitPath ? parentOf(selectedHitPath) : path
  const hitDirQuery = useDirectoryQuery(root, searchActive ? hitParentPath : path)
  const selectedHitEntry =
    searchActive && selectedHitPath
      ? ((hitDirQuery.data ?? []).find((e) => e.path === selectedHitPath) ?? null)
      : null
  // Nothing inside an archive is a file on disk to preview.
  const previewEntries = inArchive
    ? []
    : searchActive
      ? selectedHitEntry
        ? [selectedHitEntry]
        : []
      : selectedEntries

  function focusSearch() {
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }

  /**
   * Ctrl+F focuses the search box, for the whole focused window.
   *
   * Not the Ctrl+H pattern (a React `onKeyDown` on the app root): that only
   * fires once something *inside* the app already has focus, so opening a window
   * from the taskbar and pressing Ctrl+F would do nothing — and worse, the
   * handler's INPUT/TEXTAREA bail means it would be dead inside the very box it
   * is meant to focus, handing Ctrl+F to the browser's find-in-page bar.
   * `useTopWindowKeydown` gates on `system.window.isFocused()`, which is exactly
   * window scope, and `ignoreTextEntry: false` keeps it alive in the box itself.
   */
  useTopWindowKeydown(
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return
      // One text field must keep the key: the inline rename input. Stealing
      // focus mid-rename abandons the edit with no way to tell it happened.
      if (renamingPath !== null) return
      e.preventDefault()
      focusSearch()
    },
    { ignoreTextEntry: false }
  )

  // The scroll container is the ScrollArea viewport that wraps the list; we get
  // it directly via `viewportRef` (no reliance on library-internal DOM attrs).
  // The virtualizer is created here so both the list rendering and keyboard nav
  // share one instance — the latter needs `scrollToIndex` to reveal off-screen
  // rows. `listContainerRef` points at the list wrapper for header measurement.
  const viewportRef = useRef<HTMLDivElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)

  // FileList keeps its (non-virtualized) <thead> inside the same scroll
  // container, so the rows start `headerHeight` px down. Feeding that as
  // `scrollMargin` keeps scrollToIndex and the row offsets accurate.
  const [headerHeight, setHeaderHeight] = useState(0)
  const showList = !isLoading && !isError && orderedEntries.length > 0
  useLayoutEffect(() => {
    if (!showList || view.viewMode !== 'details') return
    const thead = listContainerRef.current?.querySelector('thead')
    if (thead) setHeaderHeight(thead.getBoundingClientRect().height)
  }, [showList, view.viewMode])

  // Icons view needs the pane's width to know how many tiles fit. Measured with
  // core's `useElementSize` (a ref callback — see that hook for why a mount effect
  // does not bind here either).
  const [listPane, attachListPane] = useElementSize()
  const columns = view.viewMode === 'icons' ? gridColumns(listPane.width) : 1

  /**
   * ONE virtualizer, whose items mean different things per view mode: a table row
   * in Details, a row of `columns` tiles in Icons. Everything that depends on that
   * distinction is derived here rather than inside the two renderers, so the count,
   * the size estimate and the scroll margin cannot disagree with each other.
   *
   * `scrollMargin` is the non-obvious one: Details keeps a non-virtualized
   * `<thead>` inside the same scroll container, so its rows start `headerHeight` px
   * down. Icons has no header, so passing that offset would place every tile a
   * header's height away from where the virtualizer believes it is.
   */
  const isIcons = view.viewMode === 'icons'
  // Typed as HTMLElement rather than HTMLTableRowElement: the same virtualizer
  // measures a <tr> in Details and a <div> row in Icons.
  const rowVirtualizer = useVirtualList<HTMLElement>({
    count: isIcons ? gridRowCount(orderedEntries.length, columns) : orderedEntries.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => (isIcons ? TILE_HEIGHT : 29),
    scrollMargin: isIcons ? 0 : headerHeight,
  })

  /**
   * The list wrapper is both measured (for the Icons column count) and kept in a
   * ref (for the `<thead>` height measurement). `useCallback` is load-bearing: an
   * inline arrow here is a new identity every render, so React re-ran the ref's
   * cleanup + attach each time, and the size hook's state write on attach drove an
   * infinite render loop that blanked the whole desktop.
   */
  const attachListContainer = useCallback(
    (el: HTMLDivElement | null) => {
      listContainerRef.current = el
      return attachListPane(el)
    },
    [attachListPane]
  )

  const { handleListKeyDown } = useListKeyboardNav({
    orderedEntries,
    selectedEntries,
    renamingPath,
    onOpen: handleOpen,
    setSelected,
    selectRange: selection.selectRange,
    setAnchor: selection.setAnchor,
    getCursor: selection.getCursor,
    // The nav hook speaks in ENTRY indices; the virtualizer in Icons mode counts
    // rows. This is the one place that conversion happens.
    scrollToIndex: (index) =>
      rowVirtualizer.scrollToIndex(isIcons ? Math.floor(index / columns) : index),
    columns,
  })

  /**
   * Every modal this app can put up. The verb keys must be inert while any of
   * them is open: the kit's dialogs portal to `document.body`, so a Delete
   * pressed with a confirm button focused would otherwise queue a *second*
   * delete behind the one being confirmed.
   */
  const modalOpen =
    showNewFolder ||
    trashOpen ||
    openWithFor !== null ||
    propsEntry !== null ||
    extractFor !== null ||
    deleteFlow.dialogOpen

  const { handleVerbKeyDown } = useFileVerbKeys({
    orderedEntries,
    selectedEntries,
    renamingPath,
    modalOpen,
    menuOpen: menu !== null,
    onRename: handleRename,
    onDelete: guarded((permanent: boolean) => {
      // One selected row goes through the single flow so the dialog names the
      // file; several go through the batch flow, exactly as the toolbar does.
      if (selectedEntries.length === 1) deleteFlow.requestSingle(selectedEntries[0], permanent)
      else deleteFlow.requestBatch(permanent)
    }),
    onCopy: guarded(clipboard.copy),
    onCut: guarded(clipboard.cut),
    onPaste: guarded(() => void clipboard.paste()),
    onSelectAll: selection.selectAll,
    onOpenMenu: (entry, point) => setMenu({ x: point.x, y: point.y, entry }),
    scrollToIndex: (index) =>
      rowVirtualizer.scrollToIndex(isIcons ? Math.floor(index / columns) : index),
    listRef: listContainerRef,
  })

  /** Arrows and Enter first, then the verbs — neither claims the other's keys. */
  function handleListKeys(e: React.KeyboardEvent) {
    handleListKeyDown(e)
    if (!e.defaultPrevented) handleVerbKeyDown(e)
  }

  /**
   * Ctrl+H toggles hidden files, from anywhere inside this window.
   *
   * Bound on the app's own root rather than through `useRegisteredHotkeys`, which
   * binds globally: a global Ctrl+H would toggle a background File Manager's
   * dotfiles while the user is typing in another app. Bubbling from the focused
   * descendant reaches this div only when focus is inside this window, which is
   * exactly the scope wanted. Documented in App.tsx so it appears in the
   * shortcuts overlay without flickering as windows open and close.
   */
  function handleAppKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'h') return
    // Never steal the key from a text field — renaming a file is the obvious case.
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    e.preventDefault()
    view.toggleHidden()
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleAppKeyDown}
      className="bg-surface-container-lowest flex h-full flex-col"
    >
      {/* Toolbar */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-1 border-b px-2 py-1">
        {/* Root switcher */}
        <div className="mr-1 flex items-center gap-0.5">
          {FS_ROOTS.map((r) => (
            <Button
              key={r.id}
              variant={r.id === root ? 'selected' : 'default'}
              size="sm"
              onClick={() => switchRoot(r.id)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        <div className="bg-outline-variant mx-1 h-4 w-px" />

        <Button
          variant="default"
          size="sm"
          className="flex items-center gap-1"
          disabled={inArchive}
          title={inArchive ? READ_ONLY_NOTE : undefined}
          onClick={() => setShowNewFolder(true)}
        >
          <FolderPlus size={12} />
          New Folder
        </Button>

        <Button
          variant="default"
          size="sm"
          className="flex items-center gap-1"
          disabled={inArchive}
          title={inArchive ? READ_ONLY_NOTE : undefined}
          onClick={openFilePicker}
        >
          <Upload size={12} />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {clipboard.clipboard && (
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={guarded(() => void clipboard.paste())}
          >
            <Clipboard size={12} />
            Paste{' '}
            <span className="text-on-surface-variant">
              ({clipboard.clipboard.mode === 'cut' ? 'move' : 'copy'}: {clipboardLabel})
            </span>
          </Button>
        )}

        {selected.size > 1 && !inArchive && (
          <Button
            variant="destructive"
            size="sm"
            className="flex items-center gap-1"
            onClick={(e) => deleteFlow.requestBatch(e.shiftKey)}
          >
            <Trash2 size={12} />
            Delete {selected.size}
          </Button>
        )}

        {clipboard.clipboard && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={clipboard.clear}>
            <X size={11} />
          </Button>
        )}

        {root === 'home' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5"
            title="Open the Trash"
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 size={11} />
            Trash
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => (inArchive ? archiveQuery.refetch() : dirQuery.refetch())}
        >
          <RefreshCw
            size={12}
            className={cn(
              (inArchive ? archiveQuery.isFetching : dirQuery.isFetching) && 'animate-spin'
            )}
          />
        </Button>

        <Tooltip
          content={
            view.showHidden
              ? `Hide hidden files (Ctrl+H)`
              : hiddenCount > 0
                ? `Show ${hiddenCount} hidden item${hiddenCount === 1 ? '' : 's'} (Ctrl+H)`
                : 'Show hidden files (Ctrl+H)'
          }
        >
          <Button
            variant={view.showHidden ? 'selected' : 'ghost'}
            size="sm"
            className="h-5 w-5 p-0"
            aria-pressed={view.showHidden}
            aria-label="Show hidden files"
            onClick={view.toggleHidden}
          >
            {view.showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
          </Button>
        </Tooltip>

        <Tooltip content={view.viewMode === 'icons' ? 'Details view' : 'Icons view'}>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            aria-label={
              view.viewMode === 'icons' ? 'Switch to details view' : 'Switch to icons view'
            }
            onClick={() => view.setViewMode(view.viewMode === 'icons' ? 'details' : 'icons')}
          >
            {view.viewMode === 'icons' ? <List size={12} /> : <LayoutGrid size={12} />}
          </Button>
        </Tooltip>

        <Tooltip content={previewPane.open ? 'Hide preview pane' : 'Show preview pane'}>
          <Button
            variant={previewPane.open ? 'selected' : 'ghost'}
            size="sm"
            className="h-5 w-5 p-0"
            // The other two toolbar toggles already name themselves; this one
            // was an unlabelled icon, which reads as "button" to a screen reader.
            aria-label="Show preview pane"
            aria-pressed={previewPane.open}
            onClick={previewPane.toggle}
          >
            {previewPane.open ? <PanelRightClose size={12} /> : <PanelRight size={12} />}
          </Button>
        </Tooltip>
      </div>

      {/* Breadcrumb + the search box for this folder */}
      <Breadcrumb
        root={root}
        rootLabel={rootCfg.label}
        // Inside an archive the bar reads folder / archive / inside-path, so a
        // click on any crumb says where to go.
        path={archive ? (inner ? `${archive.path}/${inner}` : archive.path) : path}
        onNavigate={handleCrumb}
        right={
          inArchive ? undefined : (
            <SearchBox
              value={query}
              onChange={setQuery}
              rootLabel={rootCfg.label}
              path={path}
              contentMode={contentMode}
              onToggleContentMode={() => setContentMode((v) => !v)}
              onRun={search.run}
              onClear={clearSearch}
              onStepIntoResults={() => {
                if (search.hits.length === 0) return
                setSelectedHitPath(search.hits[0].path)
                resultsRef.current?.focus()
              }}
              searching={search.searching}
              inputRef={searchInputRef}
            />
          )
        }
      />

      {archive && archiveListing && (
        <div className="border-outline-variant bg-surface-container-low flex flex-wrap items-center gap-2 border-b px-2 py-1">
          <Lock size={11} className="text-on-surface-variant shrink-0" aria-hidden />
          <span className="font-ui text-on-surface-variant min-w-0 flex-1 text-[11px]">
            Read-only: inside {archive.name}. Extract to open or change files.
            {archiveListing.encrypted && ' It is encrypted, so it cannot be extracted.'}
            {archiveListing.truncated &&
              ' The list is cut short because the archive is very large.'}
            {archiveListing.refused.length > 0 &&
              ` ${archiveListing.refused.length} unsafe entr${archiveListing.refused.length === 1 ? 'y' : 'ies'} (${archiveListing.refused[0].name}) will make extraction fail.`}
          </span>
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            disabled={selected.size === 0 || archiveListing.encrypted || job !== null}
            onClick={() => {
              const first = selectedEntries[0]
              if (first) extractFromView(first)
            }}
          >
            <PackageOpen size={12} />
            Extract selected ({selected.size})
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex items-center gap-1"
            disabled={archiveListing.encrypted || job !== null}
            onClick={() => extractFromView(null)}
          >
            <PackageOpen size={12} />
            Extract all
          </Button>
        </div>
      )}

      {job && (
        <div className="border-outline-variant bg-surface-container-low flex items-center gap-2 border-b px-2 py-1">
          <span className="font-ui min-w-0 flex-1 truncate text-[11px]">{job.label}</span>
          <div
            className="rounded-control border-outline-variant h-2 w-32 shrink-0 overflow-hidden border"
            role="progressbar"
            aria-label={job.label}
            aria-valuenow={job.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${job.percent}%` }}
            />
          </div>
          <span className="font-ui text-on-surface-variant w-8 text-right text-[11px] tabular-nums">
            {job.percent}%
          </span>
        </div>
      )}

      {/* Action error banner (batch delete / upload failures) */}
      {actionError && (
        <div className="border-outline-variant bg-surface-container-low flex items-center gap-2 border-b px-2 py-1">
          <span className="font-ui text-error flex-1 text-[12px]">{actionError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setActionError(null)}
          >
            <X size={11} />
          </Button>
        </div>
      )}

      {/* Body: tree pane | list pane */}
      <div className="flex min-h-0 flex-1">
        {/* Left: folder tree */}
        <div className="border-outline-variant bg-surface-container-low w-52 shrink-0 border-r">
          <ScrollArea className="h-full w-full">
            <FolderTree
              root={root}
              rootLabel={rootCfg.label}
              currentPath={path}
              onNavigate={navigate}
            />
          </ScrollArea>
        </div>

        {/* Right: search results, or the directory listing.
            One or the other, never nested — see SearchResults' docblock for why
            the listing's dropzone / background menu / arrow-key handler must
            not be able to reach the results rows. */}
        {searchActive ? (
          <SearchResults
            hits={search.hits}
            truncated={search.truncated}
            searching={search.searching}
            stale={search.stale}
            awaitingRun={search.awaitingRun}
            error={search.error}
            query={query}
            contentMode={contentMode}
            rootLabel={rootCfg.label}
            path={path}
            selectedPath={selectedHitPath}
            onSelect={setSelectedHitPath}
            onOpen={openHit}
            onDismiss={() => {
              clearSearch()
              focusSearch()
            }}
            containerRef={resultsRef}
          />
        ) : (
          <UploadDropzone onFiles={handleUploadFiles} className="min-w-0 flex-1 overflow-hidden">
            {/* The scroll area is a size container so the listing below can be
                exactly as tall as the pane (100cqh). `min-h-full` can't do it:
                the scroll content around the listing has no definite height,
                so in a short folder the listing ended under its last row, and a
                right-click or click below it reached nothing. */}
            <ScrollArea className="[container-type:size] h-full w-full" viewportRef={viewportRef}>
              {isLoading && (
                <div className="text-on-surface-variant font-ui flex items-center justify-center py-12 text-[12px]">
                  Loading…
                </div>
              )}
              {isError && (
                <div className="text-error font-ui flex items-center justify-center py-12 text-[12px]">
                  {inArchive ? `Could not read ${archive.name}.` : 'Failed to load directory.'}
                </div>
              )}
              {!isLoading && !isError && (
                <div
                  ref={attachListContainer}
                  onClick={selection.clear}
                  onContextMenu={openBackgroundMenu}
                  onKeyDown={handleListKeys}
                  tabIndex={0}
                  data-fm-listing=""
                  className="focus-visible:ring-primary min-h-[100cqh] outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  {/* A folder whose every entry is a dotfile would otherwise read as
                    "Empty folder", which is a lie the user cannot act on. */}
                  {orderedEntries.length === 0 && hiddenCount > 0 ? (
                    <div className="text-on-surface-variant flex flex-col items-center justify-center gap-2 py-12">
                      <EyeOff size={32} strokeWidth={1} />
                      <span className="font-ui text-[12px]">
                        {hiddenCount} hidden item{hiddenCount === 1 ? '' : 's'}, nothing else here
                      </span>
                      <Button variant="default" size="sm" onClick={view.toggleHidden}>
                        Show hidden files
                      </Button>
                    </div>
                  ) : isIcons ? (
                    <FileGrid
                      entries={orderedEntries}
                      virtualizer={rowVirtualizer}
                      columns={columns}
                      selected={selected}
                      onSelect={selectRow}
                      onOpen={handleOpen}
                      onContextMenu={openEntryMenu}
                      renamingPath={renamingPath}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={handleRenameCommit}
                      onRenameCancel={() => setRenamingPath(null)}
                    />
                  ) : (
                    <FileList
                      // The ORDERED array, not the raw query data. This used to pass
                      // `entries` while the virtualizer counted `orderedEntries` — it
                      // only lined up because FileList re-sorted with an identical
                      // comparator. One order, one array.
                      entries={orderedEntries}
                      sort={view.sort}
                      onSortChange={(key) => view.setSort(nextSort(view.sort, key))}
                      virtualizer={rowVirtualizer}
                      root={root}
                      selected={selected}
                      onSelect={selectRow}
                      onOpen={handleOpen}
                      onRename={handleRename}
                      onCopy={guarded((entry: FsEntry) => clipboard.copy(verbTargets(entry)))}
                      onCut={guarded((entry: FsEntry) => clipboard.cut(verbTargets(entry)))}
                      onDelete={guarded(deleteFlow.requestSingle)}
                      onContextMenu={openEntryMenu}
                      renamingPath={renamingPath}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={handleRenameCommit}
                      onRenameCancel={() => setRenamingPath(null)}
                    />
                  )}
                </div>
              )}
            </ScrollArea>
          </UploadDropzone>
        )}

        {/* Resize handle + preview pane */}
        {previewPaneVisible && (
          <>
            <div
              onMouseDown={handlePaneResizeStart}
              onDoubleClick={handlePaneResizeReset}
              onKeyDown={handlePaneResizeKey}
              // The same widget markdown-editor's SplitDivider already ships:
              // a real separator with a value the screen reader can read and
              // arrows that move it. This app had a bare onMouseDown div, which
              // is the mouse-only half of the same control (ui-conventions §41).
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize the preview pane"
              aria-valuemin={paneMin}
              aria-valuemax={paneMax}
              aria-valuenow={previewPane.width}
              className={cn(
                'bg-outline-variant hover:bg-primary w-1 shrink-0 cursor-col-resize transition-colors',
                'focus-visible:bg-primary focus-visible:w-1.5 focus-visible:outline-none',
                resizing && 'bg-primary'
              )}
            />
            <div
              style={{ width: previewPane.width }}
              className="border-outline-variant bg-surface-container-low shrink-0 border-l"
            >
              <PreviewPane root={root} selectedEntries={previewEntries} className="h-full" />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="border-outline-variant bg-surface-container-low flex items-center border-t px-2 py-0.5">
        {/* While results are showing, the status bar must count THEM. Reading
            "47 items" under three search hits is the kind of small lie that
            teaches users to stop reading the status bar at all. */}
        <span className="font-ui text-on-surface-variant text-[11px]">
          {searchActive ? (
            <SearchStatus
              rootLabel={rootCfg.label}
              path={path}
              query={query.trim()}
              count={search.hits.length}
              searching={search.searching}
              truncated={search.truncated}
            />
          ) : (
            `${entries.length} item${entries.length !== 1 ? 's' : ''}`
          )}
          {!searchActive && selected.size > 0 && ` · ${selected.size} selected`}
          {clipboard.clipboard && ` · Clipboard: ${clipboardLabel} (${clipboard.clipboard.mode})`}
        </span>
      </div>

      {/* Right-click context menu */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {/* New folder dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder} title="New Folder">
        <div className="flex flex-col gap-3">
          <Input
            label="Folder Name"
            id="new-folder-name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') setShowNewFolder(false)
            }}
            autoFocus
            placeholder="e.g. new-folder"
          />
          <div className="flex justify-end gap-2">
            <Button variant="default" size="sm" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createDirMutation.isPending}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      {openWithFor && (
        <OpenWithDialog
          fileName={openWithFor.name}
          onPick={(appId) => openEntryWith(openWithFor, appId)}
          onClose={() => setOpenWithFor(null)}
        />
      )}
      {extractFor && (
        <ExtractDialog
          request={extractFor.prompt}
          root={root}
          onExtract={(dest) =>
            void runExtract(extractFor.archivePath, extractFor.prompt, extractFor.names, dest)
          }
          onClose={() => setExtractFor(null)}
        />
      )}
      {promptDialog}
      {confirmDialog}

      <PropertiesDialog
        entry={propsEntry}
        root={root}
        open={propsEntry !== null}
        onOpenChange={(o) => !o && setPropsEntry(null)}
      />

      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        root={root}
        currentPath={path}
        onRestored={(p) =>
          system.notify({
            title: 'Restored from Trash',
            body: p,
            level: 'success',
          })
        }
        onError={failAction}
      />

      {/* Delete confirm dialog */}
      {/* Core's ConfirmDialog rather than a hand-rolled <Dialog> — this app was the
          last place in the OS with its own delete dialect (ui-conventions §44).
          The controlled component, not the `useConfirm` hook: `useDeleteFlow`
          already owns the open/confirm/cancel state machine, and rewriting it to
          await an imperative promise would be churn for no gain. */}
      <ConfirmDialog
        open={deleteFlow.dialogOpen}
        title={deleteFlow.willTrash ? 'Move to Trash' : 'Delete permanently'}
        // The copy must match what actually happens: claiming "cannot be undone"
        // for a move to the Trash would train the user to distrust the warning
        // that matters.
        message={
          <>
            {deleteFlow.willTrash ? 'Move ' : 'Permanently delete '}
            <span className="font-semibold">{deleteFlow.deleteLabel}</span>
            {deleteFlow.willTrash
              ? ' to the Trash? You can restore it from there.'
              : '? This cannot be undone.'}
          </>
        }
        confirmLabel={deleteFlow.willTrash ? 'Move to Trash' : 'Delete permanently'}
        destructive
        onConfirm={deleteFlow.confirm}
        onCancel={deleteFlow.cancel}
      />
    </div>
  )
}

/**
 * The status-bar line while search results are showing.
 *
 * A separate component, not an inline template literal, for a mechanical
 * reason: React Compiler refuses to compile a component that passes a value
 * derived from a module-level constant (`FS_ROOTS`, via `rootCfg.label`) into
 * an imported function during render — it has to assume the call could mutate
 * the global. Formatting here keeps `scopeLabel` as the one place that decides
 * how a folder is named, without costing FileManager its memoization.
 */
function SearchStatus({
  rootLabel,
  path,
  query,
  count,
  searching,
  truncated,
}: {
  rootLabel: string
  path: string
  query: string
  count: number
  searching: boolean
  truncated: boolean
}) {
  const head = searching && count === 0 ? 'Searching' : resultCountLabel(count)
  return (
    <>{`${head} for “${query}” in ${scopeLabel(rootLabel, path)}${truncated ? ' · stopped early' : ''}`}</>
  )
}
