import dayjs, { type Dayjs } from 'dayjs'
import { cn, ScrollArea } from '@imbatranim/core'
import {
  HOURS,
  HOUR_HEIGHT,
  buildWeekDays,
  formatHourLabel,
  minutesSinceMidnight,
} from '../dateUtils'
import type { CalendarEvent } from '../types'

const GUTTER_WIDTH = 48
const MIN_EVENT_HEIGHT = 18

type WeekViewProps = {
  anchor: Dayjs
  events: CalendarEvent[]
  onCreate: (start: number, end: number, allDay: boolean) => void
  onEdit: (event: CalendarEvent) => void
}

export function WeekView({ anchor, events, onCreate, onEdit }: WeekViewProps) {
  const days = buildWeekDays(anchor)
  const today = dayjs()
  const columnHeight = HOURS.length * HOUR_HEIGHT

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="border-outline-variant grid border-b"
        style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, 1fr)` }}
      >
        <div />
        {days.map((day) => {
          const isToday = day.isSame(today, 'day')
          return (
            <div
              key={day.valueOf()}
              className="border-outline-variant flex flex-col items-center gap-0.5 border-l py-1"
            >
              <span className="text-on-surface-variant text-[10px] font-semibold tracking-wide uppercase">
                {day.format('ddd')}
              </span>
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center text-[12px]',
                  isToday && 'bg-primary text-on-primary font-semibold'
                )}
              >
                {day.date()}
              </span>
            </div>
          )
        })}
      </div>

      <ScrollArea className="flex-1">
        <div className="grid" style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, 1fr)` }}>
          <div className="flex flex-col">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-outline-variant text-on-surface-variant border-b pr-1 text-right text-[10px]"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour > 0 && formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = events.filter((event) => dayjs(event.start).isSame(day, 'day'))

            return (
              <div
                key={day.valueOf()}
                className="border-outline-variant relative border-l"
                style={{ height: columnHeight }}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const start = day.hour(hour).minute(0).second(0).millisecond(0)
                      onCreate(start.valueOf(), start.add(1, 'hour').valueOf(), false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      const start = day.hour(hour).minute(0).second(0).millisecond(0)
                      onCreate(start.valueOf(), start.add(1, 'hour').valueOf(), false)
                    }}
                    className="border-outline-variant hover:bg-surface-container absolute inset-x-0 cursor-pointer border-b"
                    style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}

                {dayEvents.map((event) => {
                  const top = event.allDay
                    ? 0
                    : (minutesSinceMidnight(event.start) / 60) * HOUR_HEIGHT
                  const durationMin = Math.max((event.end - event.start) / 60_000, 15)
                  const height = event.allDay
                    ? MIN_EVENT_HEIGHT
                    : Math.max((durationMin / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT)

                  return (
                    <div
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
                      className="border-primary bg-surface-container-high text-on-surface absolute inset-x-0.5 z-10 cursor-pointer overflow-hidden border-l-2 px-1 py-px text-[10px]"
                      style={{ top, height }}
                    >
                      <span className="font-semibold">{event.title}</span>
                      {!event.allDay && (
                        <span className="text-on-surface-variant ml-1">
                          {dayjs(event.start).format('HH:mm')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
