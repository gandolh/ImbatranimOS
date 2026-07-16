import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popover } from '@base-ui/react/popover'
import { Settings } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '../../../lib/cn'
import { api } from '../../../lib/axios'
import { useWindowStore } from '../../store/windowStore'
import { APP_REGISTRY } from '../../registry'

// ─── Types ────────────────────────────────────────────────────────────────────

type SystemStats = {
  cpu: number
  ramUsedGb: number
  ramTotalGb: number
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────────

function MiniCalendar() {
  const today = dayjs()
  const startOfMonth = today.startOf('month')
  const daysInMonth = today.daysInMonth()
  const startDow = startOfMonth.day() // 0=Sun

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return (
    <div className="p-3 font-ui" style={{ minWidth: 200 }}>
      <div className="mb-2 text-center text-[12px] font-semibold text-on-surface">
        {today.format('MMMM YYYY')}
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <th
                key={d}
                className="pb-1 text-center font-medium text-on-surface-variant"
                style={{ width: '14.28%' }}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => (
                <td
                  key={di}
                  className={cn(
                    'py-0.5 text-center',
                    day === today.date()
                      ? 'bg-primary font-semibold text-on-primary'
                      : 'text-on-surface',
                    !day && 'opacity-0',
                  )}
                >
                  {day ?? ''}
                </td>
              ))}
              {/* pad row to 7 cells */}
              {Array.from({ length: 7 - week.length }).map((_, di) => (
                <td key={`pad-${di}`} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Active Windows Dropdown ───────────────────────────────────────────────────

function WindowsDropdown({ onClose }: { onClose: () => void }) {
  const windows = useWindowStore((s) => s.windows)
  const showWindow = useWindowStore((s) => s.showWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-[200] min-w-[220px] border border-outline-variant bg-surface-container-lowest shadow-[2px_2px_0_#c3c6d0]"
    >
      {windows.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-on-surface-variant font-ui">
          No open windows
        </div>
      ) : (
        windows.map((win) => (
          <div
            key={win.id}
            className="flex items-center justify-between border-b border-outline-variant last:border-b-0 hover:bg-surface-container"
          >
            <button
              className="flex-1 cursor-pointer px-3 py-1.5 text-left text-[11px] font-ui text-on-surface outline-none"
              onClick={() => {
                showWindow(win.id)
                focusWindow(win.id)
                onClose()
              }}
            >
              {win.title}
            </button>
            <button
              className="cursor-pointer px-2 py-1.5 text-[11px] font-ui text-on-surface-variant outline-none hover:text-error"
              onClick={() => closeWindow(win.id)}
              aria-label={`Close ${win.title}`}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ─── App Search Dropdown ───────────────────────────────────────────────────────

function AppSearchDropdown({
  query,
  onClose,
}: {
  query: string
  onClose: () => void
}) {
  const openWindow = useWindowStore((s) => s.openWindow)
  const ref = useRef<HTMLDivElement>(null)

  const results = APP_REGISTRY.filter((app) => {
    const q = query.toLowerCase()
    return (
      app.name.toLowerCase().includes(q) ||
      app.description.toLowerCase().includes(q) ||
      app.meta.some((m) => m.toLowerCase().includes(q))
    )
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function launch(app: (typeof APP_REGISTRY)[number]) {
    openWindow(app.id, app.name, app.defaultSize, app.minSize)
    onClose()
  }

  if (results.length === 0) {
    return (
      <div
        ref={ref}
        className="absolute left-1/2 top-full z-[200] min-w-[220px] -translate-x-1/2 border border-outline-variant bg-surface-container-lowest shadow-[2px_2px_0_#c3c6d0]"
      >
        <div className="px-3 py-2 text-[11px] font-ui text-on-surface-variant">No apps found</div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-full z-[200] min-w-[220px] -translate-x-1/2 border border-outline-variant bg-surface-container-lowest shadow-[2px_2px_0_#c3c6d0]"
    >
      {results.map((app) => {
        const Icon = app.icon
        return (
          <button
            key={app.id}
            className="flex w-full cursor-pointer items-center gap-2 border-b border-outline-variant px-3 py-1.5 text-left last:border-b-0 outline-none hover:bg-surface-container"
            onDoubleClick={() => launch(app)}
            onClick={() => launch(app)}
          >
            <Icon size={16} strokeWidth={1.5} className="shrink-0 text-on-surface-variant" />
            <div>
              <div className="text-[11px] font-medium font-ui text-on-surface">{app.name}</div>
              <div className="text-[10px] font-ui text-on-surface-variant">{app.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── TopBar ────────────────────────────────────────────────────────────────────

export function TopBar() {
  const { windows, openWindow } = useWindowStore()
  const [windowsOpen, setWindowsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [time, setTime] = useState(() => dayjs().format('HH:mm'))
  const windowsBtnRef = useRef<HTMLButtonElement>(null)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => {
      setTime(dayjs().format('HH:mm'))
    }, 10000)
    return () => clearInterval(id)
  }, [])

  // System stats query
  const { data: stats } = useQuery<SystemStats>({
    queryKey: ['system-stats'],
    queryFn: () => api.get('/system/stats').then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 55_000,
  })

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchQuery(val)
    setSearchOpen(val.length > 0)
  }

  function handleSearchFocus() {
    if (searchQuery.length > 0) setSearchOpen(true)
  }

  return (
    <div
      className="fixed left-0 top-0 z-50 flex w-full items-center border-b border-outline-variant bg-surface-container-low font-ui"
      style={{ height: 40 }}
    >
      {/* Left section */}
      <div className="relative flex items-center gap-2 px-2">
        {/* Logo */}
        <div
          className="flex items-center justify-center border border-outline-variant text-[14px] font-semibold text-primary"
          style={{ width: 24, height: 24 }}
        >
          MD
        </div>

        {/* Windows button */}
        <div className="relative">
          <button
            ref={windowsBtnRef}
            className={cn(
              'flex cursor-pointer items-center gap-1 border border-outline-variant px-2 py-0.5 text-[11px] font-medium text-on-surface-variant outline-none',
              'hover:bg-surface-container',
              windowsOpen && 'bg-surface-container',
            )}
            onClick={() => setWindowsOpen((o) => !o)}
          >
            <span>{windows.length}</span>
            <span>window{windows.length !== 1 ? 's' : ''}</span>
          </button>
          {windowsOpen && <WindowsDropdown onClose={() => setWindowsOpen(false)} />}
        </div>
      </div>

      {/* Center section — app search */}
      <div className="relative flex flex-1 justify-center">
        <div className="relative" style={{ width: 200 }}>
          <input
            className="w-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-[11px] font-ui text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
            style={{ height: 24 }}
            placeholder="Search apps…"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
          />
          {searchOpen && searchQuery.length > 0 && (
            <AppSearchDropdown
              query={searchQuery}
              onClose={() => {
                setSearchOpen(false)
                setSearchQuery('')
              }}
            />
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 px-2">
        {/* System stats */}
        <span className="text-[11px] font-ui text-on-surface-variant" style={{ whiteSpace: 'nowrap' }}>
          {stats
            ? `CPU: ${stats.cpu}% | RAM: ${stats.ramUsedGb}GB/${stats.ramTotalGb}GB`
            : '—'}
        </span>

        {/* Separator */}
        <div className="h-5 w-px bg-outline-variant" />

        {/* Calendar button + popover */}
        <Popover.Root>
          <Popover.Trigger
            className="cursor-pointer border border-outline-variant px-2 py-0.5 text-[11px] font-medium font-ui text-on-surface-variant outline-none hover:bg-surface-container"
            style={{ height: 24 }}
          >
            {dayjs().format('DD MMM')}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="end" sideOffset={4}>
              <Popover.Popup className="border border-outline-variant bg-surface-container-lowest shadow-[2px_2px_0_#c3c6d0]">
                <MiniCalendar />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>

        {/* Live clock */}
        <span className="text-[11px] font-ui text-on-surface-variant" style={{ whiteSpace: 'nowrap' }}>
          {time}
        </span>

        {/* Separator */}
        <div className="h-5 w-px bg-outline-variant" />

        {/* Settings cog */}
        <button
          className="cursor-pointer p-0.5 text-on-surface-variant outline-none hover:text-on-surface"
          aria-label="Settings"
          onClick={() => {
            const settingsApp = APP_REGISTRY.find((a) => a.id === 'settings')
            if (settingsApp) {
              openWindow(
                settingsApp.id,
                settingsApp.name,
                settingsApp.defaultSize,
                settingsApp.minSize
              )
            }
          }}
        >
          <Settings size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
