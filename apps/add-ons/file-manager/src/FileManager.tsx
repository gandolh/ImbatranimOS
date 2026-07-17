import { useRef, useState } from 'react'
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
} from 'lucide-react'
import { Button } from '@imbatranim/core'
import { Input } from '@imbatranim/core'
import { Dialog } from '@imbatranim/core'
import { ScrollArea } from '@imbatranim/core'
import { cn } from '@imbatranim/core'
import { Breadcrumb } from './components/Breadcrumb'
import { FileList } from './components/FileList'
import { FolderTree } from './components/FolderTree'
import { UploadDropzone } from './components/UploadDropzone'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { FS_ROOTS } from './types'
import type { FsEntry } from './types'
import { downloadUrl } from './api/filesApi'
import {
  useDirectoryQuery,
  useCreateDirectoryMutation,
  useDeleteEntryMutation,
  useMoveEntryMutation,
  useCopyEntryMutation,
  useUploadFileMutation,
} from './queries/filesQueries'
import { openApp } from '@imbatranim/core'

type ClipboardEntry = {
  entry: FsEntry
  mode: 'copy' | 'cut'
}

type MenuState = {
  x: number
  y: number
  entry: FsEntry | null
}

const TEXT_EXTENSIONS = new Set([
  'md',
  'txt',
  'log',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'html',
  'sh',
  'py',
])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
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
    // Notepad reads the Notes root, so only hand text files off to it from
    // there. (Opening arbitrary Home files in Notepad needs a root-aware
    // Notepad — future work, outside this lane.)
    if (root === 'notes' && isTextFile(entry.name)) {
      openApp('notepad', { openPath: entry.path })
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
            label: menu.entry.type === 'directory' ? 'Open' : 'Open in Notepad',
            icon: <FolderOpen size={13} />,
            onSelect: () => handleOpen(menu.entry!),
            disabled:
              menu.entry.type === 'file' && !(root === 'notes' && isTextFile(menu.entry.name)),
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

  const deleteDialogOpen = !!deleteTarget || batchDeletePending
  const deleteCount = batchDeletePending ? selected.size : 1
  const deleteLabel = batchDeletePending
    ? `${selected.size} item${selected.size !== 1 ? 's' : ''}`
    : deleteTarget?.name

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
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
                onClick={() => setSelected(new Set())}
                onContextMenu={openBackgroundMenu}
                className="min-h-full"
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
