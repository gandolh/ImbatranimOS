import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popover } from '@base-ui/react/popover'
import dayjs from 'dayjs'
import { cn } from '../../../lib/cn'
import { api } from '../../../lib/axios'

// Mirrors the backend's /api/system/stats response (system.service.ts).
type SystemStats = {
  cpu: { percent: number; cores: number }
  memory: { totalBytes: number; usedBytes: number; availableBytes: number; percent: number }
}

const toGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1)

function MiniCalendar() {
  const today = dayjs()
  const startOfMonth = today.startOf('month')
  const daysInMonth = today.daysInMonth()
  const startDow = startOfMonth.day()

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="p-3 font-ui" style={{ minWidth: 208 }}>
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

export function Tray() {
  const [now, setNow] = useState(() => dayjs())

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 15_000)
    return () => clearInterval(id)
  }, [])

  const { data: stats } = useQuery<SystemStats>({
    queryKey: ['system-stats'],
    queryFn: () => api.get('/system/stats').then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 55_000,
  })

  return (
    <div className="flex h-full items-center gap-1 pr-1">
      {stats && (
        <span
          className="hidden px-2 text-[11px] tabular-nums text-on-surface-variant sm:inline"
          style={{ whiteSpace: 'nowrap' }}
          title="CPU / RAM"
        >
          {Math.round(stats.cpu.percent)}% · {toGb(stats.memory.usedBytes)}/
          {toGb(stats.memory.totalBytes)} GB
        </span>
      )}

      <div className="h-5 w-px bg-outline-variant" />

      <Popover.Root>
        <Popover.Trigger
          className={cn(
            'flex h-full cursor-pointer flex-col items-end justify-center px-3 leading-tight outline-none',
            'text-on-surface hover:bg-surface-container-high',
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
          )}
        >
          <span className="text-[12px] font-semibold tabular-nums">{now.format('HH:mm')}</span>
          <span className="text-[10px] text-on-surface-variant tabular-nums">
            {now.format('ddd, DD MMM')}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="end" sideOffset={6}>
            <Popover.Popup className="border border-outline-variant bg-surface-container-low shadow-[0_-6px_24px_rgba(0,0,0,0.35)]">
              <MiniCalendar />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
