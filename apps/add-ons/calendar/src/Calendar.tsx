import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { Button, cn } from '@imbatranim/core'
import { useCalendarStore } from './calendarStore'
import { useCalendarReminders } from './reminders'
import { buildWeekDays } from './dateUtils'
import { EventDialog } from './EventDialog'
import { MonthView } from './views/MonthView'
import { WeekView } from './views/WeekView'
import type { CalendarEvent, EventDialogState } from './types'

type ViewMode = 'month' | 'week'

function rangeTitle(anchor: Dayjs, view: ViewMode): string {
  if (view === 'month') return anchor.format('MMMM YYYY')
  const days = buildWeekDays(anchor)
  const start = days[0]
  const end = days[6]
  if (start.isSame(end, 'month')) {
    return `${start.format('MMM D')} – ${end.format('D, YYYY')}`
  }
  if (start.isSame(end, 'year')) {
    return `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`
  }
  return `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`
}

export function Calendar({ windowId: _windowId }: { windowId: string }) {
  useCalendarReminders()

  const events = useCalendarStore((s) => s.events)
  const addEvent = useCalendarStore((s) => s.addEvent)
  const updateEvent = useCalendarStore((s) => s.updateEvent)
  const deleteEvent = useCalendarStore((s) => s.deleteEvent)

  const [anchor, setAnchor] = useState<Dayjs>(() => dayjs())
  const [view, setView] = useState<ViewMode>('month')
  const [dialogState, setDialogState] = useState<EventDialogState | null>(null)

  function goPrev() {
    setAnchor((a) => a.subtract(1, view === 'month' ? 'month' : 'week'))
  }
  function goNext() {
    setAnchor((a) => a.add(1, view === 'month' ? 'month' : 'week'))
  }
  function goToday() {
    setAnchor(dayjs())
  }

  function handleCreate(start: number, end: number, allDay: boolean) {
    setDialogState({ mode: 'create', start, end, allDay })
  }
  function handleEdit(event: CalendarEvent) {
    setDialogState({ mode: 'edit', event })
  }

  return (
    <div className="bg-surface-container-lowest font-ui flex h-full flex-col">
      <div className="border-outline-variant bg-surface-container-low flex h-10 shrink-0 items-center justify-between gap-2 border-b px-2">
        <div className="flex items-center gap-1">
          <Button variant="default" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={goPrev} aria-label="Previous">
            <ChevronLeft size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext} aria-label="Next">
            <ChevronRight size={14} />
          </Button>
          <span className="text-on-surface ml-1 text-[13px] font-semibold">
            {rangeTitle(anchor, view)}
          </span>
        </div>

        <div className="border-outline-variant flex border">
          <button
            type="button"
            onClick={() => setView('month')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium',
              view === 'month'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface hover:bg-surface-container-high'
            )}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setView('week')}
            className={cn(
              'border-outline-variant border-l px-2.5 py-1 text-[11px] font-medium',
              view === 'week'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface hover:bg-surface-container-high'
            )}
          >
            Week
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'month' ? (
          <MonthView anchor={anchor} events={events} onCreate={handleCreate} onEdit={handleEdit} />
        ) : (
          <WeekView anchor={anchor} events={events} onCreate={handleCreate} onEdit={handleEdit} />
        )}
      </div>

      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex h-6 shrink-0 items-center gap-1.5 border-t px-2 text-[10px]">
        <Info size={11} />
        Reminders only fire while this window is open — no background delivery.
      </div>

      <EventDialog
        state={dialogState}
        onClose={() => setDialogState(null)}
        onCreate={addEvent}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
      />
    </div>
  )
}
