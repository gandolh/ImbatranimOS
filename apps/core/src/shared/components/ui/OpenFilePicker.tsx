import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronUp, File, Folder, HardDrive } from 'lucide-react'
import { api } from '../../../lib/axios'
import { cn } from '../../../lib/cn'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { ScrollArea } from './ScrollArea'
import { Select } from './Select'

// TODO(brief 48): once the SystemHandle seam lands, this picker should read the
// FS through `system.fs` (roots + directory listing) instead of core's `api`
// client, and hand its result to callers via `system.intents`.

/** A single FS entry as returned by `GET /api/files?root=&path=`. */
type FsEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

/** The user's selection, resolved by the picker. The shape callers consume. */
export type PickedFile = {
  /** FS root id the file lives under (e.g. `'home'`). */
  root: string
  /** Path of the file relative to its root. */
  path: string
  /** The file's own name (last path segment). */
  name: string
}

/** Selectable FS roots. Mirrors File Manager's roots (the home root is primary). */
const PICKER_ROOTS = [
  { value: 'home', label: 'Home' },
  { value: 'notes', label: 'Notes' },
]

export type OpenFilePickerOptions = {
  /** Dialog title. Defaults to `'Open file'`. */
  title?: string
  /** Starting root id. Defaults to `'home'`. */
  root?: string
  /** Starting directory within the root (relative path). Defaults to `''`. */
  initialPath?: string
  /** Confirm button label. Defaults to `'Open'`. */
  confirmLabel?: string
  /**
   * Optional gate on which files are selectable — return `false` to grey a file
   * out (e.g. restrict to an extension set). Directories are always browsable.
   */
  accept?: (entry: PickedFile) => boolean
}

const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')

function listDirectory(root: string, path: string): Promise<FsEntry[]> {
  return api.get<FsEntry[]>('/files', { params: { root, path } }).then((r) => r.data)
}

type OpenFilePickerProps = OpenFilePickerOptions & {
  open: boolean
  onPick: (file: PickedFile) => void
  onCancel: () => void
}

/**
 * A themed modal file browser built on core's {@link Dialog} + {@link ScrollArea}.
 * Browses the real home FS over the shared `api` client (the same
 * `GET /api/files` endpoint File Manager uses — no new backend route), lets the
 * user navigate directories and pick a FILE. Controlled: the parent owns `open`
 * and is notified via `onPick` / `onCancel`. Dismissing counts as a cancel.
 * Prefer the {@link useOpenFilePicker} hook for the imperative `await pickFile()`
 * flow.
 */
export function OpenFilePicker({
  open,
  title = 'Open file',
  root: initialRoot = 'home',
  initialPath = '',
  confirmLabel = 'Open',
  accept,
  onPick,
  onCancel,
}: OpenFilePickerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title={title}
      className="max-w-[92vw]"
    >
      {open && (
        // Remount per open so navigation state starts fresh from the props.
        <PickerBody
          initialRoot={initialRoot}
          initialPath={initialPath}
          confirmLabel={confirmLabel}
          accept={accept}
          onPick={onPick}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

type PickerBodyProps = {
  initialRoot: string
  initialPath: string
  confirmLabel: string
  accept?: (entry: PickedFile) => boolean
  onPick: (file: PickedFile) => void
  onCancel: () => void
}

function PickerBody({
  initialRoot,
  initialPath,
  confirmLabel,
  accept,
  onPick,
  onCancel,
}: PickerBodyProps) {
  const [root, setRoot] = useState(initialRoot)
  const [path, setPath] = useState(initialPath)
  const [selected, setSelected] = useState<FsEntry | null>(null)

  const query = useQuery({
    queryKey: ['core-file-picker', root, path],
    queryFn: () => listDirectory(root, path),
  })

  const entries = useMemo(() => {
    const list = query.data ?? []
    return list.slice().sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [query.data])

  const isAccepted = useCallback(
    (entry: FsEntry) =>
      entry.type === 'file' && (!accept || accept({ root, path: entry.path, name: entry.name })),
    [accept, root]
  )

  const navigate = (nextPath: string) => {
    setPath(nextPath)
    setSelected(null)
  }

  const confirm = (entry: FsEntry) => {
    if (!isAccepted(entry)) return
    onPick({ root, path: entry.path, name: entry.name })
  }

  const rootLabel = PICKER_ROOTS.find((r) => r.value === root)?.label ?? root

  return (
    <div className="flex w-[520px] max-w-full flex-col gap-2">
      {/* Root + current-location bar */}
      <div className="flex items-center gap-2">
        <Select
          value={root}
          onValueChange={(v) => {
            setRoot(v as string)
            navigate('')
          }}
          options={PICKER_ROOTS}
          className="w-32"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={path === ''}
          onClick={() => navigate(parentOf(path))}
          aria-label="Up one folder"
        >
          <ChevronUp size={14} />
        </Button>
        <div className="font-ui text-on-surface-variant flex min-w-0 items-center gap-1 truncate text-[12px]">
          <HardDrive size={12} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{path ? `${rootLabel}/${path}` : rootLabel}</span>
        </div>
      </div>

      {/* Directory listing */}
      <ScrollArea className="border-outline-variant bg-surface-container-lowest h-64 border">
        {query.isLoading ? (
          <div className="text-on-surface-variant font-ui p-3 text-[12px]">Loading…</div>
        ) : query.isError ? (
          <div className="text-error font-ui p-3 text-[12px]">Could not read this folder.</div>
        ) : entries.length === 0 ? (
          <div className="text-on-surface-variant font-ui p-3 text-[12px]">Empty folder.</div>
        ) : (
          <ul className="font-ui py-1 text-[12px]">
            {entries.map((entry) => {
              const isDir = entry.type === 'directory'
              const isSelected = selected?.path === entry.path
              const dimmed = !isDir && !isAccepted(entry)
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    disabled={dimmed}
                    onClick={() => (isDir ? navigate(entry.path) : setSelected(entry))}
                    onDoubleClick={() => (isDir ? navigate(entry.path) : confirm(entry))}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1 text-left',
                      isSelected
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-on-surface hover:bg-surface-container',
                      dimmed && 'cursor-not-allowed opacity-40'
                    )}
                  >
                    {isDir ? (
                      <Folder
                        size={14}
                        strokeWidth={1.5}
                        className="text-primary-container shrink-0"
                      />
                    ) : (
                      <File
                        size={14}
                        strokeWidth={1.5}
                        className="text-on-surface-variant shrink-0"
                      />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-ui text-on-surface-variant min-w-0 truncate text-[12px]">
          {selected ? selected.name : 'No file selected'}
        </span>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selected}
            onClick={() => selected && confirm(selected)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

type PickerState = OpenFilePickerOptions & { open: boolean }

/**
 * Imperative file picker. Call `pickFile(opts)` to open the modal browser and
 * `await` the user's choice: it resolves the {@link PickedFile} on open, `null`
 * on cancel/dismiss. Render `filePicker` somewhere in your tree.
 *
 * ```tsx
 * const { pickFile, filePicker } = useOpenFilePicker()
 * const file = await pickFile() // { root, path, name } | null
 * if (file) openApp('image-viewer', { root: file.root, openPath: file.path })
 * // ...somewhere in JSX: {filePicker}
 * ```
 *
 * Self-contained — no global provider required beyond the desktop's React Query
 * client (always present).
 */
// Co-located with its component by design; the hook is not a Fast Refresh
// boundary, so exporting it alongside <OpenFilePicker> is safe.
// eslint-disable-next-line react-refresh/only-export-components
export function useOpenFilePicker(): {
  pickFile: (opts?: OpenFilePickerOptions) => Promise<PickedFile | null>
  filePicker: ReactNode
} {
  const [state, setState] = useState<PickerState>({ open: false })
  const resolverRef = useRef<((value: PickedFile | null) => void) | null>(null)

  const pickFile = useCallback((opts?: OpenFilePickerOptions) => {
    return new Promise<PickedFile | null>((resolve) => {
      // A re-entrant call while a picker is still pending settles the prior
      // promise as null so its awaiter never hangs.
      resolverRef.current?.(null)
      resolverRef.current = resolve
      setState({ ...opts, open: true })
    })
  }, [])

  const settle = useCallback((value: PickedFile | null) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  // If the host unmounts with a picker still pending, settle it null rather than
  // leaving the awaiter hung forever.
  useEffect(() => {
    return () => {
      resolverRef.current?.(null)
      resolverRef.current = null
    }
  }, [])

  const filePicker: ReactNode = (
    <OpenFilePicker
      open={state.open}
      title={state.title}
      root={state.root}
      initialPath={state.initialPath}
      confirmLabel={state.confirmLabel}
      accept={state.accept}
      onPick={(file) => settle(file)}
      onCancel={() => settle(null)}
    />
  )

  return { pickFile, filePicker }
}
