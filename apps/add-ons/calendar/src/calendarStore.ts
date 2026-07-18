import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CalendarEvent, CalendarEventInput } from './types'

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`

type CalendarStore = {
  /** Persisted event list — this add-on's entire storage surface
   * (`imbatranimos:calendar`). No FS, no backend. */
  events: CalendarEvent[]
  addEvent: (input: CalendarEventInput) => string
  updateEvent: (id: string, patch: Partial<CalendarEventInput>) => void
  deleteEvent: (id: string) => void
  markReminderFired: (id: string) => void
}

export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set) => ({
      events: [],

      addEvent: (input) => {
        const id = newId()
        set((state) => ({
          events: [...state.events, { ...input, id, reminderFired: false }],
        }))
        return id
      },

      updateEvent: (id, patch) =>
        set((state) => ({
          events: state.events.map((event) => {
            if (event.id !== id) return event
            // Editing the trigger time re-arms the reminder so it can fire
            // again for the new time rather than staying silently guarded.
            const reArm = 'start' in patch || 'reminderMinutes' in patch
            return { ...event, ...patch, reminderFired: reArm ? false : event.reminderFired }
          }),
        })),

      deleteEvent: (id) =>
        set((state) => ({ events: state.events.filter((event) => event.id !== id) })),

      markReminderFired: (id) =>
        set((state) => ({
          events: state.events.map((event) =>
            event.id === id ? { ...event, reminderFired: true } : event
          ),
        })),
    }),
    { name: 'imbatranimos:calendar' }
  )
)
