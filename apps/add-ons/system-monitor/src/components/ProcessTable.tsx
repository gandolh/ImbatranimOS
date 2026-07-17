import { useMemo, useState } from 'react'
import { XCircle } from 'lucide-react'
import type { ProcessInfo } from '../api/systemApi'
import { useKillProcessMutation } from '../queries/systemQueries'

type SortKey = 'pid' | 'name' | 'cpuPercent' | 'memPercent'

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'pid', label: 'PID', className: 'w-16' },
  { key: 'name', label: 'Name' },
  { key: 'cpuPercent', label: 'CPU%', className: 'w-20 text-right' },
  { key: 'memPercent', label: 'MEM%', className: 'w-20 text-right' },
]

export function ProcessTable({ processes }: { processes: ProcessInfo[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cpuPercent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [failedPid, setFailedPid] = useState<number | null>(null)
  const killMutation = useKillProcessMutation()

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

  function handleKill(pid: number) {
    setFailedPid(null)
    killMutation.mutate({ pid }, { onError: () => setFailedPid(pid) })
  }

  return (
    <table className="w-full border-collapse font-mono text-[11px]">
      <thead className="bg-surface-container-low sticky top-0">
        <tr className="border-outline-variant text-on-surface-variant border-b">
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              className={`font-ui hover:text-primary cursor-pointer px-2 py-1 text-left font-semibold tracking-wider uppercase select-none ${col.className ?? ''}`}
              onClick={() => toggleSort(col.key)}
            >
              {col.label}
              {sortKey === col.key && (sortDir === 'desc' ? ' ▼' : ' ▲')}
            </th>
          ))}
          <th className="font-ui w-14 px-2 py-1 text-right font-semibold tracking-wider uppercase">
            Kill
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.pid} className="border-outline-variant/50 hover:bg-surface-container border-b">
            <td className="px-2 py-0.5">{p.pid}</td>
            <td className="max-w-[200px] truncate px-2 py-0.5" title={p.name}>
              {p.name}
            </td>
            <td className="px-2 py-0.5 text-right">{p.cpuPercent.toFixed(1)}</td>
            <td className="px-2 py-0.5 text-right">{p.memPercent.toFixed(1)}</td>
            <td className="px-2 py-0.5 text-right">
              <button
                onClick={() => handleKill(p.pid)}
                disabled={killMutation.isPending && killMutation.variables?.pid === p.pid}
                className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-40"
                title={`Send SIGTERM to pid ${p.pid}`}
              >
                <XCircle size={13} />
              </button>
              {failedPid === p.pid && (
                <div className="text-error mt-0.5 text-[9px] whitespace-nowrap">not permitted</div>
              )}
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={5} className="font-ui text-on-surface-variant px-2 py-6 text-center">
              No processes
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
