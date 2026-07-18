import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  FileArchive,
  Folder,
  File as FileIcon,
  Loader2,
  X,
  XCircle,
} from 'lucide-react'
import { cn, notify, useIntentStore, useWindowStore } from '@imbatranim/core'
import {
  basename,
  compressPaths,
  errorMessage,
  extractArchive,
  formatBytes,
  listDir,
} from './lib/archiveApi'
import type { ArchiveIntent, DirEntry } from './types'
import { APP_NAME } from './appName'

type Phase = 'idle' | 'running' | 'done' | 'error'

interface Outcome {
  title: string
  detail: string
  contents: DirEntry[]
}

/**
 * Light progress / result window. Launched by the file-manager context menu
 * with a one-shot {@link ArchiveIntent}; it drives the authed archive routes,
 * shows progress + the result, previews extracted contents, and fires a
 * `notify(...)` on completion. All the security (the FS jail, zip-slip guard,
 * resource caps) lives on the backend — this is purely the UI.
 */
export function ArchiveManager({ windowId }: { windowId: string }) {
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const close = useCallback(() => closeWindow(windowId), [closeWindow, windowId])

  const [phase, setPhase] = useState<Phase>('idle')
  const [label, setLabel] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [errorText, setErrorText] = useState('')
  const startedRef = useRef(false)

  const run = useCallback(async (intent: ArchiveIntent) => {
    const fail = (err: unknown) => {
      const msg = errorMessage(err)
      setErrorText(msg)
      setPhase('error')
      notify({
        title: 'Archive operation failed',
        body: msg,
        appId: 'archive-manager',
        level: 'error',
      })
    }

    if (intent.action === 'extract') {
      setLabel(`Extracting ${basename(intent.path)}…`)
      setPhase('running')
      try {
        const res = await extractArchive(intent.root, intent.path, intent.dest)
        let contents: DirEntry[] = []
        try {
          contents = await listDir(intent.root, res.dest)
        } catch {
          contents = []
        }
        setOutcome({
          title: 'Extracted',
          detail: `${res.entries} file${res.entries === 1 ? '' : 's'} · ${formatBytes(
            res.totalBytes
          )} → ${res.dest}`,
          contents,
        })
        setPhase('done')
        notify({
          title: 'Extraction complete',
          body: `${basename(intent.path)} → ${res.dest}`,
          appId: 'archive-manager',
          level: 'success',
        })
      } catch (err) {
        fail(err)
      }
      return
    }

    // compress
    setLabel(`Compressing ${intent.paths.length} item${intent.paths.length === 1 ? '' : 's'}…`)
    setPhase('running')
    try {
      const res = await compressPaths(intent.root, intent.paths, intent.dest, intent.format)
      setOutcome({
        title: 'Compressed',
        detail: `${res.entries} file${res.entries === 1 ? '' : 's'} · ${formatBytes(
          res.bytes
        )} → ${intent.dest}`,
        contents: [],
      })
      setPhase('done')
      notify({
        title: 'Archive created',
        body: `${res.entries} file${res.entries === 1 ? '' : 's'} → ${intent.dest}`,
        appId: 'archive-manager',
        level: 'success',
      })
    } catch (err) {
      fail(err)
    }
  }, [])

  // Drain the one-shot intent exactly once (ref-guarded for StrictMode) and
  // kick off the archive job. Starting an async operation on window-open is the
  // intended "sync to an external system" use of an effect; the progress
  // setState happens inside that async job, which the rule can't see through.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const intent = useIntentStore.getState().consumeIntent(windowId) as ArchiveIntent | undefined
    if (intent?.action === 'extract' || intent?.action === 'compress') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void run(intent)
    }
  }, [windowId, run])

  return (
    <div className="bg-surface text-on-surface flex h-full flex-col">
      {/* title bar */}
      <div className="border-outline-variant bg-surface-container-low flex items-center gap-2 border-b px-3 py-2">
        <FileArchive size={15} strokeWidth={1.75} className="text-primary" />
        <span className="text-[12px] font-bold tracking-tight">{APP_NAME}</span>
        <div className="flex-1" />
        <button
          title="Close"
          onClick={close}
          className="hover:bg-error hover:text-on-error border-outline-variant flex h-7 w-7 items-center justify-center border transition-colors"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {phase === 'idle' && (
          <div className="text-on-surface-variant m-auto max-w-[80%] text-center text-[12px]">
            Right-click a .zip or .tar.gz in Files and choose
            <span className="text-on-surface font-semibold"> Extract here</span>, or select items
            and choose
            <span className="text-on-surface font-semibold"> Compress</span>.
          </div>
        )}

        {phase === 'running' && (
          <div className="text-on-surface m-auto flex flex-col items-center gap-3 text-[12px] font-semibold">
            <Loader2 size={26} strokeWidth={1.75} className="animate-spin" />
            {label}
          </div>
        )}

        {phase === 'error' && (
          <div className="m-auto flex max-w-[90%] flex-col items-center gap-2 text-center">
            <XCircle size={26} strokeWidth={1.75} className="text-error" />
            <div className="text-[12px] font-semibold">Operation failed</div>
            <div className="text-on-surface-variant text-[11px]">{errorText}</div>
          </div>
        )}

        {phase === 'done' && outcome && (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} strokeWidth={1.75} className="text-primary" />
              <div>
                <div className="text-[12px] font-semibold">{outcome.title}</div>
                <div className="text-on-surface-variant text-[11px]">{outcome.detail}</div>
              </div>
            </div>

            {outcome.contents.length > 0 && (
              <div className="border-outline-variant min-h-0 flex-1 overflow-auto border">
                <ul className="divide-outline-variant/50 divide-y">
                  {outcome.contents.map((entry) => (
                    <li
                      key={entry.path}
                      className="hover:bg-surface-container-high flex items-center gap-2 px-2 py-1 text-[11px]"
                    >
                      {entry.type === 'directory' ? (
                        <Folder size={13} strokeWidth={1.75} className="text-primary shrink-0" />
                      ) : (
                        <FileIcon
                          size={13}
                          strokeWidth={1.75}
                          className="text-on-surface-variant shrink-0"
                        />
                      )}
                      <span className="truncate">{entry.name}</span>
                      <span className="text-on-surface-variant ml-auto shrink-0 tabular-nums">
                        {entry.type === 'file' ? formatBytes(entry.size) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={close}
              className={cn(
                'border-outline-variant hover:bg-surface-container-high self-end border px-3 py-1.5',
                'text-[12px] font-semibold transition-colors'
              )}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
