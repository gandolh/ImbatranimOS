import { useState } from 'react'
import { Activity, List, Info, type LucideIcon } from 'lucide-react'
import { useSystemAbout, useSystemProcesses, useSystemStats } from './queries/systemQueries'
import { Gauge } from './components/Gauge'
import { ProcessTable } from './components/ProcessTable'
import { AboutPanel } from './components/AboutPanel'

type Tab = 'overview' | 'processes' | 'about'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'processes', label: 'Processes', icon: List },
  { id: 'about', label: 'About', icon: Info },
]

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

// Window contract: ComponentType<{ windowId: string }>, registered in
// shared/registry/registry.tsx by the controller agent (see handoff).
export function SystemMonitor({ windowId: _windowId }: { windowId: string }) {
  const [tab, setTab] = useState<Tab>('overview')
  const statsQuery = useSystemStats()
  const processesQuery = useSystemProcesses()
  const aboutQuery = useSystemAbout()

  const stats = statsQuery.data
  const processes = processesQuery.data ?? []

  return (
    <div className="flex h-full select-none flex-col bg-surface-container-lowest">
      <div className="flex items-center gap-0.5 border-b border-outline-variant bg-surface-container-low px-1 py-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border px-3 py-1 font-ui text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          )
        })}
        <div className="flex-1" />
        {tab === 'processes' && (
          <span className="pr-2 font-mono text-[10px] text-on-surface-variant">
            {processes.length} procs
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === 'overview' && (
          <div className="flex flex-col gap-5">
            {!stats && !statsQuery.isError && (
              <p className="font-ui text-[12px] text-on-surface-variant">Loading live stats…</p>
            )}
            {statsQuery.isError && (
              <p className="font-ui text-[12px] text-error">Failed to reach the system stats endpoint.</p>
            )}
            {stats && (
              <>
                <Gauge
                  label="CPU"
                  percent={stats.cpu.percent}
                  detail={`${stats.cpu.cores} core${stats.cpu.cores !== 1 ? 's' : ''}`}
                />
                <Gauge
                  label="Memory"
                  percent={stats.memory.percent}
                  detail={`${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)}`}
                />
                <Gauge
                  label="Disk"
                  percent={stats.disk.percent}
                  detail={`${formatBytes(stats.disk.usedBytes)} / ${formatBytes(stats.disk.totalBytes)} · ${stats.disk.path}`}
                />
              </>
            )}
          </div>
        )}

        {tab === 'processes' && (
          <>
            {processesQuery.isLoading && (
              <p className="font-ui text-[12px] text-on-surface-variant">Loading processes…</p>
            )}
            {processesQuery.isError && (
              <p className="font-ui text-[12px] text-error">Failed to load process list.</p>
            )}
            {!processesQuery.isLoading && !processesQuery.isError && (
              <ProcessTable processes={processes} />
            )}
          </>
        )}

        {tab === 'about' && (
          <>
            {aboutQuery.isLoading && (
              <p className="font-ui text-[12px] text-on-surface-variant">Loading…</p>
            )}
            {aboutQuery.isError && (
              <p className="font-ui text-[12px] text-error">Failed to load system identity.</p>
            )}
            {aboutQuery.data && <AboutPanel about={aboutQuery.data} />}
          </>
        )}
      </div>
    </div>
  )
}
