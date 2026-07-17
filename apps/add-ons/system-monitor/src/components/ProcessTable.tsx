import { useMemo, useRef, useState } from 'react'
import { XCircle } from 'lucide-react'
import { useVirtualList } from '@imbatranim/core'
import type { ProcessInfo } from '../api/systemApi'
import { useKillProcessMutation } from '../queries/systemQueries'

type SortKey = 'pid' | 'name' | 'cpuPercent' | 'memPercent'

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'pid', label: 'PID' },
  { key: 'name', label: 'Name' },
  { key: 'cpuPercent', label: 'CPU%', align: 'right' },
  { key: 'memPercent', label: 'MEM%', align: 'right' },
]

// Shared grid template so the header and every virtual row keep their columns
// aligned (PID · Name · CPU% · MEM% · Kill). Replaces the old <table> layout.
const GRID = 'grid grid-cols-[4rem_1fr_5rem_5rem_3.5rem]'

export function ProcessTable({ processes }: { processes: ProcessInfo[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [failedPid, setFailedPid] = useState<number | null>(null)
  const killMutation = useKillProcessMutation()

  const scrollRef = useRef<HTMLDivElement>(null)

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(
    () =>
      [...processes].sort((a, b) => {
        const dir = sortDir === 'desc' ? -1 : 1
        if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
        return (a[sortKey] - b[sortKey]) * dir
      }),
    [processes, sortKey, sortDir]
  )

  const virtualizer = useVirtualList({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
  })

  function handleKill(pid: number) {
    setFailedPid(null)
    killMutation.mutate({ pid }, { onError: () => setFailedPid(pid) })
  }

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div className="flex h-full flex-col font-mono text-[11px]">
      {/* Sortable header — kept outside the virtualized body so it never scrolls. */}
      <div className="bg-surface-container-low border-outline-variant text-on-surface-variant border-b">
        <div className={GRID}>
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`font-ui hover:text-primary cursor-pointer px-2 py-1 font-semibold tracking-wider uppercase select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              onClick={() => toggleSort(col.key)}
            >
              {col.label}
              {sortKey === col.key && (sortDir === 'desc' ? ' ▼' : ' ▲')}
            </div>
          ))}
          <div className="font-ui px-2 py-1 text-right font-semibold tracking-wider uppercase">
            Kill
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="font-ui text-on-surface-variant px-2 py-6 text-center">No processes</div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualRows.map((vr) => {
              const p = sorted[vr.index]
              return (
                <div
                  key={p.pid}
                  data-index={vr.index}
                  ref={virtualizer.measureElement}
                  className={`${GRID} border-outline-variant/50 hover:bg-surface-container absolute top-0 left-0 w-full items-center border-b`}
                  style={{ transform: `translateY(${vr.start}px)` }}
                >
                  <div className="px-2 py-0.5">{p.pid}</div>
                  <div className="min-w-0 truncate px-2 py-0.5" title={p.name}>
                    {p.name}
                  </div>
                  <div className="px-2 py-0.5 text-right">{p.cpuPercent.toFixed(1)}</div>
                  <div className="px-2 py-0.5 text-right">{p.memPercent.toFixed(1)}</div>
                  <div className="px-2 py-0.5 text-right">
                    <button
                      onClick={() => handleKill(p.pid)}
                      disabled={killMutation.isPending && killMutation.variables?.pid === p.pid}
                      className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                      title={`Send SIGTERM to pid ${p.pid}`}
                    >
                      <XCircle size={13} />
                    </button>
                    {failedPid === p.pid && (
                      <div className="text-error mt-0.5 text-[9px] whitespace-nowrap">
                        not permitted
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
