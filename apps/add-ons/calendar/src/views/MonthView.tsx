import dayjs, { type Dayjs } from 'dayjs'
import { cn } from '@imbatranim/core'
import { WEEKDAY_LABELS, buildMonthGrid } from '../dateUtils'
import type { CalendarEvent } from '../types'

const MAX_VISIBLE_EVENTS = 3

type MonthViewProps = {
  anchor: Dayjs
  events: CalendarEvent[]
  onCreate: (start: number, end: number, allDay: boolean) => void
  onEdit: (event: CalendarEvent) => void
}

export function MonthView({ anchor, events, onCreate, onEdit }: MonthViewProps) {
  const weeks = buildMonthGrid(anchor)
  const today = dayjs()

  return (
    <div className="flex h-full flex-col">
      <div className="border-outline-variant grid grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-on-surface-variant py-1 text-center text-[11px] font-semibold tracking-wide uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="border-outline-variant grid flex-1 grid-cols-7 border-b last:border-b-0"
          >
            {week.map((day) => {
              const inMonth = day.month() === anchor.month()
              const isToday = day.isSame(today, 'day')
              const dayEvents = events
                .filter((event) => dayjs(event.start).isSame(day, 'day'))
                .sort((a, b) => a.start - b.start)
              const overflow = dayEvents.length - MAX_VISIBLE_EVENTS

              return (
                <div
                  key={day.valueOf()}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    onCreate(day.startOf('day').valueOf(), day.endOf('day').valueOf(), true)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onCreate(day.startOf('day').valueOf(), day.endOf('day').valueOf(), true)
                    }
                  }}
                  className={cn(
                    'border-outline-variant hover:bg-surface-container flex cursor-pointer flex-col items-start gap-0.5 overflow-hidden border-r p-1 text-left last:border-r-0',
                    !inMonth && 'text-on-surface-variant/60'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center text-[11px]',
                      isToday && 'bg-primary text-on-primary font-semibold'
                    )}
                  >
                    {day.date()}
                  </span>

                  <div className="flex w-full min-w-0 flex-col gap-0.5 overflow-hidden">
                    {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                      <span
                        key={event.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(event)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            onEdit(event)
                          }
                        }}
                        className="border-primary bg-surface-container-high text-on-surface w-full truncate border-l-2 px-1 py-px text-[10px]"
                      >
                        {!event.allDay && dayjs(event.start).format('HH:mm ')}
                        {event.title}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span className="text-on-surface-variant px-1 text-[9px]">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
