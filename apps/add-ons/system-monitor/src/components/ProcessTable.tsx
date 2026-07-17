import { useState } from 'react'
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

  const sorted = [...processes].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
    return (a[sortKey] - b[sortKey]) * dir
  })

  function handleKill(pid: number) {
    setFailedPid(null)
    killMutation.mutate(
      { pid },
      { onError: () => setFailedPid(pid) },
    )
  }

  return (
    <table className="w-full border-collapse font-mono text-[11px]">
      <thead className="sticky top-0 bg-surface-container-low">
        <tr className="border-b border-outline-variant text-on-surface-variant">
          {COLUMNS.map((col) => (
            <th
              key={col.key}
              className={`cursor-pointer select-none px-2 py-1 text-left font-ui font-semibold uppercase tracking-wider hover:text-primary ${col.className ?? ''}`}
              onClick={() => toggleSort(col.key)}
            >
              {col.label}
              {sortKey === col.key && (sortDir === 'desc' ? ' ▼' : ' ▲')}
            </th>
          ))}
          <th className="w-14 px-2 py-1 text-right font-ui font-semibold uppercase tracking-wider">Kill</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.pid} className="border-b border-outline-variant/50 hover:bg-surface-container">
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
                className="text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
                title={`Send SIGTERM to pid ${p.pid}`}
              >
                <XCircle size={13} />
              </button>
              {failedPid === p.pid && (
                <div className="mt-0.5 whitespace-nowrap text-[9px] text-error">not permitted</div>
              )}
            </td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={5} className="px-2 py-6 text-center font-ui text-on-surface-variant">
              No processes
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
