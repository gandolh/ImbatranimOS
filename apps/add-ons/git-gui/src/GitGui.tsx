import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw,
  FolderGit2,
  History,
  FileDiff,
  GitCommitVertical,
  AlertTriangle,
} from 'lucide-react'
import { Button, Input, Select, ScrollArea, cn, notify } from '@imbatranim/core'
import {
  commit as apiCommit,
  fetchDiff,
  fetchLog,
  fetchStatus,
  stagePaths,
  unstagePaths,
} from './api/gitApi'
import { GIT_ROOTS } from './types'
import type { GitCommit, GitStatusEntry } from './types'
import { badgeCode, codeColor, codeLabel, partitionEntries } from './lib/statusFormat'
import { errorMessage } from './lib/errors'

type Selection = { path: string; staged: boolean } | null
type RightTab = 'diff' | 'history'

export function GitGui(_props: { windowId: string }) {
  const [root, setRoot] = useState<string>('home')
  const [pathInput, setPathInput] = useState<string>('')
  const [repo, setRepo] = useState<{ root: string; path: string } | null>(null)

  const [entries, setEntries] = useState<GitStatusEntry[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const [selection, setSelection] = useState<Selection>(null)
  const [diff, setDiff] = useState<string>('')
  const [tab, setTab] = useState<RightTab>('diff')

  const [message, setMessage] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (r: string, p: string) => {
    setBusy(true)
    setError(null)
    try {
      const [status, log] = await Promise.all([fetchStatus(r, p), fetchLog(r, p)])
      setEntries(status.entries)
      setCommits(log.commits)
      setChecked(new Set())
    } catch (err) {
      setError(errorMessage(err, 'Could not open repository'))
      setEntries([])
      setCommits([])
    } finally {
      setBusy(false)
    }
  }, [])

  const open = useCallback(() => {
    const path = pathInput.trim()
    setRepo({ root, path })
    setSelection(null)
    setDiff('')
    void reload(root, path)
  }, [pathInput, root, reload])

  // Load the diff whenever the selected file changes.
  useEffect(() => {
    // Nothing selected → the diff pane shows its empty state; leave state alone
    // (diff is reset to '' on open, which is the only path that clears the
    // selection). Avoids a synchronous setState in the effect body.
    if (!repo || !selection) return
    let cancelled = false
    fetchDiff(repo.root, repo.path, selection.staged, selection.path)
      .then((res) => {
        if (!cancelled) setDiff(res.diff)
      })
      .catch((err) => {
        if (!cancelled) setDiff(`Could not load diff: ${errorMessage(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [repo, selection])

  const toggleCheck = useCallback((key: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const runStage = useCallback(
    async (paths: string[], stage: boolean) => {
      if (!repo || paths.length === 0) return
      setBusy(true)
      setError(null)
      try {
        const res = stage
          ? await stagePaths(repo.root, repo.path, paths)
          : await unstagePaths(repo.root, repo.path, paths)
        setEntries(res.entries)
        setChecked(new Set())
      } catch (err) {
        setError(errorMessage(err, stage ? 'Stage failed' : 'Unstage failed'))
      } finally {
        setBusy(false)
      }
    },
    [repo]
  )

  const doCommit = useCallback(async () => {
    if (!repo || message.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      await apiCommit(repo.root, repo.path, message.trim())
      setMessage('')
      notify({ level: 'success', title: 'Committed', body: 'Changes committed.', appId: 'git-gui' })
      await reload(repo.root, repo.path)
      setTab('history')
    } catch (err) {
      setError(errorMessage(err, 'Commit failed'))
    } finally {
      setBusy(false)
    }
  }, [repo, message, reload])

  const { staged, unstaged } = partitionEntries(entries)
  const checkedIn = (list: GitStatusEntry[], prefix: string) =>
    list.map((e) => `${prefix}:${e.path}`).filter((k) => checked.has(k))
  const selectedUnstaged = checkedIn(unstaged, 'u').map((k) => k.slice(2))
  const selectedStaged = checkedIn(staged, 's').map((k) => k.slice(2))

  return (
    <div className="bg-surface text-on-surface flex h-full flex-col">
      {/* Repo picker toolbar */}
      <div className="border-outline-variant flex items-end gap-2 border-b px-3 py-2">
        <div className="w-28">
          <Select
            label="Root"
            value={root}
            onValueChange={(v) => setRoot(String(v))}
            options={GIT_ROOTS.map((r) => ({ value: r.id, label: r.label }))}
          />
        </div>
        <div className="flex-1">
          <Input
            label="Repository path"
            placeholder="e.g. projects/my-repo"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') open()
            }}
          />
        </div>
        <Button variant="primary" onClick={open} disabled={busy}>
          <FolderGit2 size={13} /> Open
        </Button>
        <Button
          variant="default"
          onClick={() => repo && reload(repo.root, repo.path)}
          disabled={busy || !repo}
          title="Refresh"
        >
          <RefreshCw size={13} className={cn(busy && 'animate-spin')} />
        </Button>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container flex items-center gap-2 px-3 py-1.5 text-[12px]">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {!repo ? (
        <div className="text-on-surface-variant flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FolderGit2 size={40} strokeWidth={1} />
          <p className="font-ui text-[12px]">
            Pick a root and a repository path, then Open to load status &amp; history.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left: changes + commit */}
          <div className="border-outline-variant flex min-h-0 w-[46%] flex-col border-r">
            <ChangeSection
              title="Staged changes"
              prefix="s"
              entries={staged}
              checked={checked}
              selection={selection}
              staged
              onToggle={toggleCheck}
              onSelect={(path) => {
                setSelection({ path, staged: true })
                setTab('diff')
              }}
            />
            <div className="border-outline-variant border-t px-3 py-1.5">
              <Button
                size="sm"
                variant="default"
                disabled={busy || selectedStaged.length === 0}
                onClick={() => runStage(selectedStaged, false)}
              >
                Unstage selected ({selectedStaged.length})
              </Button>
            </div>

            <ChangeSection
              title="Changes"
              prefix="u"
              entries={unstaged}
              checked={checked}
              selection={selection}
              staged={false}
              onToggle={toggleCheck}
              onSelect={(path) => {
                setSelection({ path, staged: false })
                setTab('diff')
              }}
            />
            <div className="border-outline-variant border-t px-3 py-1.5">
              <Button
                size="sm"
                variant="default"
                disabled={busy || selectedUnstaged.length === 0}
                onClick={() => runStage(selectedUnstaged, true)}
              >
                Stage selected ({selectedUnstaged.length})
              </Button>
            </div>

            {/* Commit box */}
            <div className="border-outline-variant mt-auto flex flex-col gap-2 border-t p-3">
              <textarea
                className={cn(
                  'border-outline-variant bg-surface-container-lowest text-on-surface min-h-[52px] w-full resize-none border px-2.5 py-1.5',
                  'font-content text-[13px] outline-none',
                  'placeholder:text-on-surface-variant',
                  'focus:border-primary focus:ring-primary/40 focus:ring-2'
                )}
                placeholder="Commit message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button
                variant="primary"
                disabled={busy || message.trim().length === 0 || staged.length === 0}
                onClick={doCommit}
              >
                <GitCommitVertical size={14} /> Commit {staged.length > 0 && `(${staged.length})`}
              </Button>
            </div>
          </div>

          {/* Right: diff / history */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-outline-variant flex border-b">
              <TabButton active={tab === 'diff'} onClick={() => setTab('diff')}>
                <FileDiff size={13} /> Diff
              </TabButton>
              <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                <History size={13} /> History
              </TabButton>
            </div>

            {tab === 'diff' ? (
              <DiffPane diff={diff} hasSelection={selection !== null} />
            ) : (
              <LogPane commits={commits} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeSection({
  title,
  prefix,
  entries,
  checked,
  selection,
  staged,
  onToggle,
  onSelect,
}: {
  title: string
  prefix: string
  entries: GitStatusEntry[]
  checked: Set<string>
  selection: Selection
  staged: boolean
  onToggle: (key: string) => void
  onSelect: (path: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-on-surface-variant font-ui bg-surface-container-low px-3 py-1 text-[11px] font-semibold tracking-wider uppercase">
        {title} ({entries.length})
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {entries.length === 0 ? (
          <div className="text-on-surface-variant px-3 py-2 text-[12px] italic">Nothing here</div>
        ) : (
          <ul>
            {entries.map((e) => {
              const key = `${prefix}:${e.path}`
              const code = badgeCode(e)
              const active = selection?.path === e.path && selection.staged === staged
              return (
                <li
                  key={key}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1',
                    'hover:bg-surface-container-high cursor-pointer',
                    active && 'bg-primary-container text-on-primary-container'
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary shrink-0 cursor-pointer"
                    checked={checked.has(key)}
                    onChange={() => onToggle(key)}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelect(e.path)}
                  >
                    <span
                      className={cn(
                        'w-4 shrink-0 text-center font-mono text-[12px] font-bold',
                        codeColor(code)
                      )}
                      title={codeLabel(code)}
                    >
                      {code}
                    </span>
                    <span className="font-content truncate text-[13px]">{e.path}</span>
                    {e.origPath && (
                      <span className="text-on-surface-variant truncate text-[11px]">
                        ← {e.origPath}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-ui flex items-center gap-1.5 px-3 py-1.5 text-[12px]',
        'cursor-pointer border-b-2 transition-colors',
        active
          ? 'border-primary text-on-surface'
          : 'text-on-surface-variant hover:text-on-surface border-transparent'
      )}
    >
      {children}
    </button>
  )
}

function DiffPane({ diff, hasSelection }: { diff: string; hasSelection: boolean }) {
  if (!hasSelection) {
    return (
      <div className="text-on-surface-variant flex flex-1 items-center justify-center text-[12px] italic">
        Select a file to view its diff
      </div>
    )
  }
  if (diff.trim().length === 0) {
    return (
      <div className="text-on-surface-variant flex flex-1 items-center justify-center text-[12px] italic">
        No changes to show
      </div>
    )
  }
  return (
    <ScrollArea className="min-h-0 flex-1" orientation="both">
      <pre className="p-3 font-mono text-[11px] leading-snug whitespace-pre">
        {diff.split('\n').map((line, i) => (
          <div key={i} className={cn(diffLineColor(line))}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </ScrollArea>
  )
}

function diffLineColor(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'text-primary'
  if (line.startsWith('-') && !line.startsWith('---')) return 'text-error'
  if (line.startsWith('@@')) return 'text-tertiary'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-on-surface-variant'
  return 'text-on-surface'
}

function LogPane({ commits }: { commits: GitCommit[] }) {
  if (commits.length === 0) {
    return (
      <div className="text-on-surface-variant flex flex-1 items-center justify-center text-[12px] italic">
        No commits yet
      </div>
    )
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul className="divide-outline-variant/50 divide-y">
        {commits.map((c) => (
          <li key={c.hash} className="px-3 py-2">
            <div className="font-content text-on-surface text-[13px]">{c.subject}</div>
            <div className="text-on-surface-variant font-ui mt-0.5 flex items-center gap-2 text-[11px]">
              <span className="font-mono">{c.hash.slice(0, 7)}</span>
              <span>{c.authorName}</span>
              <span>{formatDate(c.date)}</span>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
