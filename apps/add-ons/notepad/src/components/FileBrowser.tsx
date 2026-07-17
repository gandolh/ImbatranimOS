import { useState } from 'react'
import { FileText, Folder, ArrowLeft, Plus, FolderPlus, Trash2, Clock } from 'lucide-react'
import { ScrollArea, useConfirm, usePrompt } from '@imbatranim/core'
import {
  useCreateDirectoryMutation,
  useCreateFileMutation,
  useDeleteDirectoryMutation,
  useDeleteFileMutation,
  useNotesQuery,
  useRecentFilesQuery,
} from '../queries/notepadQueries'
import type { NoteEntry } from '../types'

export function FileBrowser({ onOpenFile }: { onOpenFile: (path: string) => void }) {
  const [currentPath, setCurrentPath] = useState('')
  const { data: entries = [], isLoading } = useNotesQuery(currentPath)
  const { data: recent = [] } = useRecentFilesQuery()

  const createFile = useCreateFileMutation()
  const createDir = useCreateDirectoryMutation()
  const deleteFile = useDeleteFileMutation()
  const deleteDir = useDeleteDirectoryMutation()
  const { confirm, confirmDialog } = useConfirm()
  const { prompt: promptName, promptDialog } = usePrompt()

  async function handleCreateFile() {
    const name = await promptName({ title: 'New file', placeholder: 'File name (.md)' })
    if (name) {
      const path = currentPath ? `${currentPath}/${name}` : name
      createFile.mutate({ path })
    }
  }

  async function handleCreateDir() {
    const name = await promptName({ title: 'New folder', placeholder: 'Directory name' })
    if (name) {
      const path = currentPath ? `${currentPath}/${name}` : name
      createDir.mutate(path)
    }
  }

  if (isLoading) return <div className="p-4 text-center">Loading...</div>

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* breadcrumbs */}
      <div className="border-outline-variant bg-surface-container-low flex h-10 items-center gap-2 border-b px-3 py-2">
        <button onClick={() => setCurrentPath('')} className="hover:text-primary p-1" title="Root">
          <Folder size={16} />
        </button>
        {currentPath && (
          <>
            <span className="text-on-surface-variant">/</span>
            <span className="truncate text-[13px] font-semibold">{currentPath}</span>
            <button
              onClick={() => {
                const parts = currentPath.split('/')
                parts.pop()
                setCurrentPath(parts.join('/'))
              }}
              className="hover:bg-surface-container-high ml-auto p-1"
            >
              <ArrowLeft size={14} />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Recent */}
        <div className="border-outline-variant bg-surface-container-low flex w-1/3 flex-col border-r">
          <div className="border-outline-variant text-on-surface-variant flex items-center gap-2 border-b px-3 py-2 text-[11px] font-bold tracking-wider uppercase">
            <Clock size={12} />
            Recent
          </div>
          <ScrollArea className="flex-1">
            {recent.map((file) => (
              <button
                key={file.id}
                onClick={() => onOpenFile(file.path)}
                className="hover:bg-surface-container-high border-outline-variant/30 w-full truncate border-b px-3 py-2 text-left text-[12px]"
              >
                {file.path.split('/').pop()}
                <div className="text-on-surface-variant text-[10px] opacity-70">{file.path}</div>
              </button>
            ))}
            {recent.length === 0 && (
              <div className="p-4 text-center text-[11px] italic opacity-50">No recent files</div>
            )}
          </ScrollArea>
        </div>

        {/* Main: Browse */}
        <div className="flex flex-1 flex-col">
          <div className="border-outline-variant flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-on-surface-variant text-[11px] font-bold uppercase">Files</span>
            <div className="flex gap-1">
              <button
                onClick={() => void handleCreateFile()}
                className="hover:bg-surface-container-high p-1"
                title="New File"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => void handleCreateDir()}
                className="hover:bg-surface-container-high p-1"
                title="New Folder"
              >
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
                onDelete={async () => {
                  if (
                    await confirm({
                      title: 'Delete',
                      message: `Delete ${entry.name}?`,
                      destructive: true,
                    })
                  ) {
                    if (entry.type === 'directory') deleteDir.mutate(entry.path)
                    else deleteFile.mutate(entry.path)
                  }
                }}
              />
            ))}
            {entries.length === 0 && (
              <div className="text-on-surface-variant flex flex-col items-center justify-center p-8 opacity-50">
                <Folder size={32} strokeWidth={1} />
                <span className="mt-2 text-[12px]">Empty directory</span>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
      {confirmDialog}
      {promptDialog}
    </div>
  )
}

function EntryRow({
  entry,
  onOpen,
  onDelete,
}: {
  entry: NoteEntry
  onOpen: () => void
  onDelete: () => Promise<void>
}) {
  return (
    <div
      className="group border-outline-variant/30 hover:bg-surface-container-low flex cursor-pointer items-center gap-3 border-b px-3 py-2"
      onClick={onOpen}
    >
      {entry.type === 'directory' ? (
        <Folder size={16} className="text-secondary shrink-0" />
      ) : (
        <FileText size={16} className="text-primary shrink-0" />
      )}
      <span className="flex-1 truncate text-[13px]">{entry.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          void onDelete()
        }}
        className="hover:text-error p-1 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
