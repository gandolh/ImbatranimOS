import { useState } from 'react'
import { FileText, Folder, ArrowLeft, Plus, FolderPlus, Trash2, Clock } from 'lucide-react'
import { ScrollArea } from '../../../shared/components/ui/ScrollArea'
import {
  useCreateDirectoryMutation,
  useCreateFileMutation,
  useDeleteDirectoryMutation,
  useDeleteFileMutation,
  useNotesQuery,
  useRecentFilesQuery,
} from '../queries/notepadQueries'
import type { NoteEntry } from '../types'

export function FileBrowser({
  onOpenFile,
}: {
  onOpenFile: (path: string) => void
}) {
  const [currentPath, setCurrentPath] = useState('')
  const { data: entries = [], isLoading } = useNotesQuery(currentPath)
  const { data: recent = [] } = useRecentFilesQuery()

  const createFile = useCreateFileMutation()
  const createDir = useCreateDirectoryMutation()
  const deleteFile = useDeleteFileMutation()
  const deleteDir = useDeleteDirectoryMutation()

  function handleCreateFile() {
    const name = prompt('File name (.md):')
    if (name) {
      const path = currentPath ? `${currentPath}/${name}` : name
      createFile.mutate({ path })
    }
  }

  function handleCreateDir() {
    const name = prompt('Directory name:')
    if (name) {
      const path = currentPath ? `${currentPath}/${name}` : name
      createDir.mutate(path)
    }
  }

  if (isLoading) return <div className="p-4 text-center">Loading...</div>

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* breadcrumbs */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant bg-surface-container-low h-10">
        <button
          onClick={() => setCurrentPath('')}
          className="hover:text-primary p-1"
          title="Root"
        >
          <Folder size={16} />
        </button>
        {currentPath && (
          <>
            <span className="text-on-surface-variant">/</span>
            <span className="text-[13px] font-semibold truncate">{currentPath}</span>
            <button
              onClick={() => {
                const parts = currentPath.split('/')
                parts.pop()
                setCurrentPath(parts.join('/'))
              }}
              className="ml-auto p-1 hover:bg-surface-container-high"
            >
              <ArrowLeft size={14} />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Recent */}
        <div className="w-1/3 border-r border-outline-variant bg-surface-container-low flex flex-col">
          <div className="px-3 py-2 border-b border-outline-variant text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
            <Clock size={12} />
            Recent
          </div>
          <ScrollArea className="flex-1">
            {recent.map((file) => (
              <button
                key={file.id}
                onClick={() => onOpenFile(file.path)}
                className="w-full text-left px-3 py-2 hover:bg-surface-container-high border-b border-outline-variant/30 text-[12px] truncate"
              >
                {file.path.split('/').pop()}
                <div className="text-[10px] text-on-surface-variant opacity-70">{file.path}</div>
              </button>
            ))}
            {recent.length === 0 && <div className="p-4 text-center text-[11px] italic opacity-50">No recent files</div>}
          </ScrollArea>
        </div>

        {/* Main: Browse */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-outline-variant">
            <span className="text-[11px] font-bold uppercase text-on-surface-variant">Files</span>
            <div className="flex gap-1">
              <button onClick={handleCreateFile} className="p-1 hover:bg-surface-container-high" title="New File">
                <Plus size={14} />
              </button>
              <button onClick={handleCreateDir} className="p-1 hover:bg-surface-container-high" title="New Folder">
                <FolderPlus size={14} />
              </button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {entries.map((entry) => (
              <EntryRow
                key={entry.path}
                entry={entry}
                onOpen={() => {
                  if (entry.type === 'directory') setCurrentPath(entry.path)
                  else onOpenFile(entry.path)
                }}
                onDelete={() => {
                  if (confirm(`Delete ${entry.name}?`)) {
                    if (entry.type === 'directory') deleteDir.mutate(entry.path)
                    else deleteFile.mutate(entry.path)
                  }
                }}
              />
            ))}
            {entries.length === 0 && (
              <div className="flex flex-col items-center justify-center p-8 text-on-surface-variant opacity-50">
                <Folder size={32} strokeWidth={1} />
                <span className="text-[12px] mt-2">Empty directory</span>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}

function EntryRow({ entry, onOpen, onDelete }: { entry: NoteEntry; onOpen: () => void; onDelete: () => void }) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 border-b border-outline-variant/30 hover:bg-surface-container-low cursor-pointer"
      onClick={onOpen}
    >
      {entry.type === 'directory' ? (
        <Folder size={16} className="text-secondary shrink-0" />
      ) : (
        <FileText size={16} className="text-primary shrink-0" />
      )}
      <span className="text-[13px] flex-1 truncate">{entry.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:text-error transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
