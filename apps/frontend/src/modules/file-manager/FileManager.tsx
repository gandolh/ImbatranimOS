import { useRef, useState } from 'react'
import {
  FolderPlus,
  Clipboard,
  Upload,
  Trash2,
  RefreshCw,
  X,
} from 'lucide-react'
import { Button } from '../../shared/components/ui/Button'
import { Input } from '../../shared/components/ui/Input'
import { Dialog } from '../../shared/components/ui/Dialog'
import { ScrollArea } from '../../shared/components/ui/ScrollArea'
import { cn } from '../../lib/cn'
import { Breadcrumb } from './components/Breadcrumb'
import { FileList } from './components/FileList'
import { UploadDropzone } from './components/UploadDropzone'
import { FS_ROOTS } from './types'
import type { FsEntry } from './types'
import {
  useDirectoryQuery,
  useCreateDirectoryMutation,
  useDeleteEntryMutation,
  useMoveEntryMutation,
  useCopyEntryMutation,
  useUploadFileMutation,
} from './queries/filesQueries'
import { useWindowStore } from '../../shared/store/windowStore'
import { useNotepadStore } from '../notepad/store/notepadStore'
// SWARM:S5-todo — replace with openApp('notepad', { openPath }) once S5 lands

type ClipboardEntry = {
  entry: FsEntry
  mode: 'copy' | 'cut'
}

const TEXT_EXTENSIONS = new Set(['md', 'txt', 'log', 'json', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'sh', 'py'])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

export function FileManager({ windowId: _windowId }: { windowId: string }) {
  const rootCfg = FS_ROOTS[0]
  const [root] = useState(rootCfg.id)
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

  // File input ref for upload picker
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openWindow = useWindowStore((s) => s.openWindow)
  const setNotepadEditor = useNotepadStore((s) => s.setEditor)

  const dirQuery = useDirectoryQuery(root, path)
  const createDirMutation = useCreateDirectoryMutation(root, path)
  const deleteMutation = useDeleteEntryMutation(root, path)
  const moveMutation = useMoveEntryMutation(root, path)
  const copyMutation = useCopyEntryMutation(root, path)
  const uploadMutation = useUploadFileMutation(root, path)

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
      setPath(entry.path)
      setSelected(new Set())
      return
    }
    if (isTextFile(entry.name)) {
      // SWARM:S5-todo: replace with openApp('notepad', { openPath: `${root}/${entry.path}` }) once S5 lands
      const newId = openWindow(
        'notepad',
        entry.name,
        { width: 600, height: 500 },
        { width: 400, height: 300 },
      )
      // Pass path via notepadStore directly (same approach as Notepad's own FileBrowser)
      setNotepadEditor(newId, entry.path)
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

  const entries = dirQuery.data ?? []
  const isLoading = dirQuery.isLoading
  const isError = dirQuery.isError

  const deleteDialogOpen = !!deleteTarget || batchDeletePending
  const deleteCount = batchDeletePending ? selected.size : 1
  const deleteLabel = batchDeletePending
    ? `${selected.size} item${selected.size !== 1 ? 's' : ''}`
    : deleteTarget?.name

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-outline-variant bg-surface-container-low px-2 py-1">
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
      <Breadcrumb
        root={root}
        rootLabel={rootCfg.label}
        path={path}
        onNavigate={setPath}
      />

      {/* File listing */}
      <UploadDropzone
        onFiles={handleUploadFiles}
        className="flex-1 overflow-hidden"
      >
        <ScrollArea className="h-full w-full">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-on-surface-variant font-ui text-[12px]">
              Loading…
            </div>
          )}
          {isError && (
            <div className="flex items-center justify-center py-12 text-error font-ui text-[12px]">
              Failed to load directory.
            </div>
          )}
          {!isLoading && !isError && (
            <div onClick={() => setSelected(new Set())} className="min-h-full">
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

      {/* Status bar */}
      <div className="flex items-center border-t border-outline-variant bg-surface-container-low px-2 py-0.5">
        <span className="font-ui text-[11px] text-on-surface-variant">
          {entries.length} item{entries.length !== 1 ? 's' : ''}
          {selected.size > 0 && ` · ${selected.size} selected`}
          {clipboard && ` · Clipboard: ${clipboard.entry.name} (${clipboard.mode})`}
        </span>
      </div>

      {/* New folder dialog */}
      <Dialog
        open={showNewFolder}
        onOpenChange={setShowNewFolder}
        title="New Folder"
      >
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
          <p className="font-content text-[13px] text-on-surface">
            Delete{' '}
            <span className="font-semibold">{deleteLabel}</span>
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
