import {
  Folder,
  FileText,
  File,
  FileImage,
  FileArchive,
  FileCode,
  Download,
  Pencil,
  Copy,
  Scissors,
  Trash2,
} from 'lucide-react'
import { cn } from '@imbatranim/core'
import { Tooltip } from '@imbatranim/core'
import { Button } from '@imbatranim/core'
import type { FsEntry } from '../types'
import { downloadUrl } from '../api/filesApi'
import { sortEntries } from '../lib/fileKind'
import dayjs from 'dayjs'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(entry: FsEntry) {
  if (entry.type === 'directory')
    return <Folder size={16} strokeWidth={1.5} className="text-primary-container" />
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  if (['md', 'txt', 'log'].includes(ext))
    return <FileText size={16} strokeWidth={1.5} className="text-on-surface-variant" />
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext))
    return <FileImage size={16} strokeWidth={1.5} className="text-secondary" />
  if (['zip', 'tar', 'gz', 'bz2', '7z'].includes(ext))
    return <FileArchive size={16} strokeWidth={1.5} className="text-tertiary" />
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'sh', 'css', 'html'].includes(ext))
    return <FileCode size={16} strokeWidth={1.5} className="text-on-surface-variant" />
  return <File size={16} strokeWidth={1.5} className="text-on-surface-variant" />
}

type FileListProps = {
  entries: FsEntry[]
  root: string
  selected: Set<string>
  onSelect: (path: string, multi: boolean) => void
  onOpen: (entry: FsEntry) => void
  onRename: (entry: FsEntry) => void
  onCopy: (entry: FsEntry) => void
  onCut: (entry: FsEntry) => void
  onDelete: (entry: FsEntry) => void
  onContextMenu?: (entry: FsEntry, e: React.MouseEvent) => void
  renamingPath: string | null
  renameValue: string
  onRenameChange: (val: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
}

export function FileList({
  entries,
  root,
  selected,
  onSelect,
  onOpen,
  onRename,
  onCopy,
  onCut,
  onDelete,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: FileListProps) {
  const sorted = sortEntries(entries)

  if (sorted.length === 0) {
    return (
      <div className="text-on-surface-variant flex flex-col items-center justify-center gap-2 py-12">
        <Folder size={32} strokeWidth={1} />
        <span className="font-ui text-[12px]">Empty folder</span>
      </div>
    )
  }

  return (
    <table className="font-ui w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-outline-variant bg-surface-container-low text-on-surface-variant border-b">
          <th className="w-6 px-2 py-1 text-left font-medium" />
          <th className="px-2 py-1 text-left font-medium">Name</th>
          <th className="w-20 px-2 py-1 text-right font-medium">Size</th>
          <th className="w-32 px-2 py-1 text-right font-medium">Modified</th>
          <th className="w-20 px-2 py-1 text-right font-medium" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry) => {
          const isSelected = selected.has(entry.path)
          const isRenaming = renamingPath === entry.path

          return (
            <tr
              key={entry.path}
              data-entry-path={entry.path}
              onClick={(e) => {
                // Stop the click from bubbling to the background container's
                // "clear selection" handler — otherwise every row click
                // selects then immediately deselects in the same tick.
                e.stopPropagation()
                onSelect(entry.path, e.ctrlKey || e.metaKey)
              }}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => {
                if (!onContextMenu) return
                e.preventDefault()
                if (!selected.has(entry.path)) onSelect(entry.path, false)
                onContextMenu(entry, e)
              }}
              className={cn(
                'border-outline-variant/30 cursor-pointer border-b transition-colors',
                isSelected
                  ? 'bg-primary-container text-on-primary-container'
                  : 'hover:bg-surface-container'
              )}
            >
              <td className="px-2 py-1">{getFileIcon(entry)}</td>
              <td className="px-2 py-1">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onRenameCommit()
                      if (e.key === 'Escape') onRenameCancel()
                    }}
                    onBlur={onRenameCommit}
                    onClick={(e) => e.stopPropagation()}
                    className="border-primary bg-surface-container-lowest font-content text-on-surface w-full border px-1 py-0 text-[12px] outline-none"
                  />
                ) : (
                  <span className="select-none">{entry.name}</span>
                )}
              </td>
              <td className="text-on-surface-variant px-2 py-1 text-right">
                {entry.type === 'file' ? formatSize(entry.size) : '—'}
              </td>
              <td className="text-on-surface-variant px-2 py-1 text-right">
                {dayjs(entry.modifiedAt).format('MMM D, YYYY')}
              </td>
              <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 [tr:hover_&]:opacity-100">
                  <Tooltip content="Rename">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => onRename(entry)}
                    >
                      <Pencil size={11} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Copy">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => onCopy(entry)}
                    >
                      <Copy size={11} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Cut">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => onCut(entry)}
                    >
                      <Scissors size={11} />
                    </Button>
                  </Tooltip>
                  {entry.type === 'file' && (
                    <Tooltip content="Download">
                      <a
                        href={downloadUrl(root, entry.path)}
                        download={entry.name}
                        className="text-on-surface hover:border-outline-variant hover:bg-surface-container inline-flex h-5 w-5 cursor-pointer items-center justify-center border border-transparent"
                      >
                        <Download size={11} />
                      </a>
                    </Tooltip>
                  )}
                  <Tooltip content="Delete">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-error hover:bg-error-container h-5 w-5 p-0"
                      onClick={() => onDelete(entry)}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </Tooltip>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
