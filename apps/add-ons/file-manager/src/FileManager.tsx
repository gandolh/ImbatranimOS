import { useEffect, useRef, useState } from 'react'
import {
  FolderPlus,
  Clipboard,
  Upload,
  Trash2,
  RefreshCw,
  X,
  Pencil,
  Copy,
  Scissors,
  Download,
  FolderOpen,
  PanelRight,
  PanelRightClose,
  FileSpreadsheet,
  FileText,
} from 'lucide-react'
import { Button } from '@imbatranim/core'
import { Input } from '@imbatranim/core'
import { Dialog } from '@imbatranim/core'
import { ScrollArea } from '@imbatranim/core'
import { Tooltip } from '@imbatranim/core'
import { cn } from '@imbatranim/core'
import { Breadcrumb } from './components/Breadcrumb'
import { FileList } from './components/FileList'
import { FolderTree } from './components/FolderTree'
import { UploadDropzone } from './components/UploadDropzone'
import { PreviewPane } from './components/PreviewPane'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { FS_ROOTS } from './types'
import type { FsEntry } from './types'
import { downloadUrl } from './api/filesApi'
import { sortEntries } from './lib/fileKind'
import { resolveOpenApp, openAppLabel } from './lib/openWith'
import {
  makeBlankFile,
  uniqueNewFileName,
  editorAppId,
  type NewFileKind,
} from './lib/newFileTemplates'
import { usePreviewPaneSettings } from './store/previewPaneStore'
import {
  useDirectoryQuery,
  useCreateDirectoryMutation,
  useDeleteEntryMutation,
  useMoveEntryMutation,
  useCopyEntryMutation,
  useUploadFileMutation,
} from './queries/filesQueries'
import { openApp } from '@imbatranim/core'

// Below this app-window width the preview pane hides regardless of its
// on/off setting — there just isn't room for tree + list + pane at once.
const PREVIEW_PANE_COLLAPSE_WIDTH = 640

type ClipboardEntry = {
  entry: FsEntry
  mode: 'copy' | 'cut'
}

type MenuState = {
  x: number
  y: number
  entry: FsEntry | null
}

function triggerDownload(root: string, entry: FsEntry) {
  const a = document.createElement('a')
  a.href = downloadUrl(root, entry.path)
  a.download = entry.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function FileManager({ windowId: _windowId }: { windowId: string }) {
  const [root, setRoot] = useState(FS_ROOTS[0].id)
  const rootCfg = FS_ROOTS.find((r) => r.id === root) ?? FS_ROOTS[0]
  const [path, setPath] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Create folder dialog
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<FsEntry | null>(null)
  const [batchDeletePending, setBatchDeletePending] = useState(false)

  // Clipboard
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null)

  // Right-click context menu
  const [menu, setMenu] = useState<MenuState | null>(null)

  // File input ref for upload picker
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preview pane: on/off + width persist across sessions; visibility also
  // collapses at small app-window widths regardless of the persisted setting.
  const previewPane = usePreviewPaneSettings()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const fileListRef = useRef<HTMLDivElement>(null)

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

  function handlePaneResizeStart(e: React.MouseEvent) {
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
  }

  const dirQuery = useDirectoryQuery(root, path)
  const createDirMutation = useCreateDirectoryMutation(root, path)
  const deleteMutation = useDeleteEntryMutation(root, path)
  const moveMutation = useMoveEntryMutation(root, path)
  const copyMutation = useCopyEntryMutation(root, path)
  const uploadMutation = useUploadFileMutation(root, path)

  function switchRoot(nextRoot: string) {
    setRoot(nextRoot)
    setPath('')
    setSelected(new Set())
    setClipboard(null)
  }

  function navigate(nextPath: string) {
    setPath(nextPath)
    setSelected(new Set())
  }

  function handleSelect(entryPath: string, multi: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (multi) {
        if (next.has(entryPath)) next.delete(entryPath)
        else next.add(entryPath)
      } else {
        if (next.size === 1 && next.has(entryPath)) next.clear()
        else {
          next.clear()
          next.add(entryPath)
        }
      }
      return next
    })
  }

  function handleOpen(entry: FsEntry) {
    if (entry.type === 'directory') {
      navigate(entry.path)
      return
    }
    // Extension → app routing lives in ./lib/openWith (shared by double-click
    // and Enter). Viewers are root-aware and get `{ root }`; Notepad ignores it
    // (Notes root only, enforced by the map's onlyRoots).
    const appId = resolveOpenApp(root, entry.name)
    if (appId) {
      openApp(appId, { openPath: entry.path, root })
    }
  }

  function handleRename(entry: FsEntry) {
    setRenamingPath(entry.path)
    setRenameValue(entry.name)
  }

  function handleRenameCommit() {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null)
      return
    }
    const dir = renamingPath.includes('/')
      ? renamingPath.substring(0, renamingPath.lastIndexOf('/'))
      : ''
    const newPath = dir ? `${dir}/${renameValue.trim()}` : renameValue.trim()
    if (newPath !== renamingPath) {
      moveMutation.mutate({ from: renamingPath, to: newPath })
    }
    setRenamingPath(null)
  }

  function handleCopy(entry: FsEntry) {
    setClipboard({ entry, mode: 'copy' })
  }

  function handleCut(entry: FsEntry) {
    setClipboard({ entry, mode: 'cut' })
  }

  function handlePaste() {
    if (!clipboard) return
    const name = clipboard.entry.path.split('/').pop() ?? clipboard.entry.name
    const dest = path ? `${path}/${name}` : name
    if (clipboard.mode === 'copy') {
      copyMutation.mutate({ from: clipboard.entry.path, to: dest })
    } else {
      moveMutation.mutate({ from: clipboard.entry.path, to: dest })
      setClipboard(null)
    }
  }

  function handleDeleteEntry(entry: FsEntry) {
    setDeleteTarget(entry)
    setBatchDeletePending(false)
  }

  function handleBatchDelete() {
    if (selected.size === 0) return
    setBatchDeletePending(true)
    setDeleteTarget(null)
  }

  function handleConfirmDelete() {
    if (batchDeletePending) {
      const paths = Array.from(selected)
      paths.forEach((p) => deleteMutation.mutate(p))
      setSelected(new Set())
    } else if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.path)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.path)
        return next
      })
    }
    setDeleteTarget(null)
    setBatchDeletePending(false)
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

  function handleNewOfficeFile(kind: NewFileKind) {
    // Born in the file manager: write a blank template at the current directory
    // under a non-colliding name, then open it straight into the editor.
    const existing = (dirQuery.data ?? []).map((e) => e.name)
    const name = uniqueNewFileName(kind, existing)
    const filePath = path ? `${path}/${name}` : name
    const file = makeBlankFile(kind, name)
    uploadMutation.mutate(
      { path: filePath, file },
      { onSuccess: () => openApp(editorAppId(kind), { openPath: filePath, root }) }
    )
  }

  function handleUploadFiles(files: File[]) {
    files.forEach((file) => {
      const filePath = path ? `${path}/${file.name}` : file.name
      uploadMutation.mutate({ path: filePath, file })
    })
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) {
      handleUploadFiles(Array.from(files))
      e.target.value = ''
    }
  }

  function openEntryMenu(entry: FsEntry, e: React.MouseEvent) {
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  function openBackgroundMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, entry: null })
  }

  const menuItems: ContextMenuItem[] = menu
    ? menu.entry
      ? [
          {
            label:
              menu.entry.type === 'directory'
                ? 'Open'
                : openAppLabel(resolveOpenApp(root, menu.entry.name)),
            icon: <FolderOpen size={13} />,
            onSelect: () => handleOpen(menu.entry!),
            disabled: menu.entry.type === 'file' && !resolveOpenApp(root, menu.entry.name),
          },
          ...(menu.entry.type === 'file'
            ? [
                {
                  label: 'Download',
                  icon: <Download size={13} />,
                  onSelect: () => triggerDownload(root, menu.entry!),
                } as ContextMenuItem,
              ]
            : []),
          { type: 'separator' },
          {
            label: 'Rename',
            icon: <Pencil size={13} />,
            onSelect: () => handleRename(menu.entry!),
          },
          {
            label: 'Copy',
            icon: <Copy size={13} />,
            onSelect: () => handleCopy(menu.entry!),
          },
          {
            label: 'Cut',
            icon: <Scissors size={13} />,
            onSelect: () => handleCut(menu.entry!),
          },
          { type: 'separator' },
          {
            label: 'Delete',
            icon: <Trash2 size={13} />,
            danger: true,
            onSelect: () => handleDeleteEntry(menu.entry!),
          },
        ]
      : [
          {
            label: 'New Folder',
            icon: <FolderPlus size={13} />,
            onSelect: () => setShowNewFolder(true),
          },
          {
            label: 'New Spreadsheet',
            icon: <FileSpreadsheet size={13} />,
            onSelect: () => handleNewOfficeFile('spreadsheet'),
          },
          {
            label: 'New Document',
            icon: <FileText size={13} />,
            onSelect: () => handleNewOfficeFile('document'),
          },
          {
            label: 'Upload…',
            icon: <Upload size={13} />,
            onSelect: () => fileInputRef.current?.click(),
          },
          {
            label: 'Paste',
            icon: <Clipboard size={13} />,
            disabled: !clipboard,
            onSelect: handlePaste,
          },
          { type: 'separator' },
          {
            label: 'Refresh',
            icon: <RefreshCw size={13} />,
            onSelect: () => dirQuery.refetch(),
          },
        ]
    : []

  const entries = dirQuery.data ?? []
  const isLoading = dirQuery.isLoading
  const isError = dirQuery.isError

  const orderedEntries = sortEntries(entries)
  const selectedEntries = orderedEntries.filter((e) => selected.has(e.path))

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    if (orderedEntries.length === 0) return
    // Editing a name inline — let the input handle its own keys.
    if (renamingPath) return

    if (e.key === 'Enter') {
      if (selectedEntries.length === 1) {
        e.preventDefault()
        handleOpen(selectedEntries[0])
      }
      return
    }

    e.preventDefault()
    const currentPath = selectedEntries.length === 1 ? selectedEntries[0].path : null
    const currentIndex = currentPath
      ? orderedEntries.findIndex((en) => en.path === currentPath)
      : -1
    let nextIndex: number
    if (currentIndex === -1) {
      nextIndex = e.key === 'ArrowDown' ? 0 : orderedEntries.length - 1
    } else if (e.key === 'ArrowDown') {
      nextIndex = Math.min(currentIndex + 1, orderedEntries.length - 1)
    } else {
      nextIndex = Math.max(currentIndex - 1, 0)
    }
    const next = orderedEntries[nextIndex]
    setSelected(new Set([next.path]))
    const row = fileListRef.current?.querySelector(`[data-entry-path="${CSS.escape(next.path)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }

  const deleteDialogOpen = !!deleteTarget || batchDeletePending
  const deleteCount = batchDeletePending ? selected.size : 1
  const deleteLabel = batchDeletePending
    ? `${selected.size} item${selected.size !== 1 ? 's' : ''}`
    : deleteTarget?.name

  return (
    <div ref={containerRef} className="bg-surface-container-lowest flex h-full flex-col">
      {/* Toolbar */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-1 border-b px-2 py-1">
        {/* Root switcher */}
        <div className="mr-1 flex items-center gap-0.5">
          {FS_ROOTS.map((r) => (
            <Button
              key={r.id}
              variant={r.id === root ? 'primary' : 'default'}
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
          onClick={() => setShowNewFolder(true)}
        >
          <FolderPlus size={12} />
          New Folder
        </Button>

        <Button
          variant="default"
          size="sm"
          className="flex items-center gap-1"
          onClick={() => fileInputRef.current?.click()}
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

        {clipboard && (
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-1"
            onClick={handlePaste}
          >
            <Clipboard size={12} />
            Paste{' '}
            <span className="text-on-surface-variant">
              ({clipboard.mode === 'cut' ? 'move' : 'copy'}: {clipboard.entry.name})
            </span>
          </Button>
        )}

        {selected.size > 1 && (
          <Button
            variant="destructive"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleBatchDelete}
          >
            <Trash2 size={12} />
            Delete {selected.size}
          </Button>
        )}

        {clipboard && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setClipboard(null)}
          >
            <X size={11} />
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => dirQuery.refetch()}
        >
          <RefreshCw size={12} className={cn(dirQuery.isFetching && 'animate-spin')} />
        </Button>

        <Tooltip content={previewPane.open ? 'Hide preview pane' : 'Show preview pane'}>
          <Button
            variant={previewPane.open ? 'primary' : 'ghost'}
            size="sm"
            className="h-5 w-5 p-0"
            onClick={previewPane.toggle}
          >
            {previewPane.open ? <PanelRightClose size={12} /> : <PanelRight size={12} />}
          </Button>
        </Tooltip>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb root={root} rootLabel={rootCfg.label} path={path} onNavigate={navigate} />

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

        {/* Right: file listing */}
        <UploadDropzone onFiles={handleUploadFiles} className="min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            {isLoading && (
              <div className="text-on-surface-variant font-ui flex items-center justify-center py-12 text-[12px]">
                Loading…
              </div>
            )}
            {isError && (
              <div className="text-error font-ui flex items-center justify-center py-12 text-[12px]">
                Failed to load directory.
              </div>
            )}
            {!isLoading && !isError && (
              <div
                ref={fileListRef}
                onClick={() => setSelected(new Set())}
                onContextMenu={openBackgroundMenu}
                onKeyDown={handleListKeyDown}
                tabIndex={0}
                className="min-h-full outline-none"
              >
                <FileList
                  entries={entries}
                  root={root}
                  selected={selected}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onRename={handleRename}
                  onCopy={handleCopy}
                  onCut={handleCut}
                  onDelete={handleDeleteEntry}
                  onContextMenu={openEntryMenu}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={handleRenameCommit}
                  onRenameCancel={() => setRenamingPath(null)}
                />
              </div>
            )}
          </ScrollArea>
        </UploadDropzone>

        {/* Resize handle + preview pane */}
        {previewPaneVisible && (
          <>
            <div
              onMouseDown={handlePaneResizeStart}
              className={cn(
                'bg-outline-variant hover:bg-primary w-1 shrink-0 cursor-col-resize transition-colors',
                resizing && 'bg-primary'
              )}
            />
            <div
              style={{ width: previewPane.width }}
              className="border-outline-variant bg-surface-container-low shrink-0 border-l"
            >
              <PreviewPane root={root} selectedEntries={selectedEntries} className="h-full" />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="border-outline-variant bg-surface-container-low flex items-center border-t px-2 py-0.5">
        <span className="font-ui text-on-surface-variant text-[11px]">
          {entries.length} item{entries.length !== 1 ? 's' : ''}
          {selected.size > 0 && ` · ${selected.size} selected`}
          {clipboard && ` · Clipboard: ${clipboard.entry.name} (${clipboard.mode})`}
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

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setBatchDeletePending(false)
          }
        }}
        title="Confirm Delete"
      >
        <div className="flex flex-col gap-3">
          <p className="font-content text-on-surface text-[13px]">
            Delete <span className="font-semibold">{deleteLabel}</span>
            {deleteCount > 1 ? '' : ''}? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setDeleteTarget(null)
                setBatchDeletePending(false)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
