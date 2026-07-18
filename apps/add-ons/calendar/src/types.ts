/** A single calendar event. Times are epoch ms (local-time semantics only —
 * no timezone conversion happens anywhere in this package). */
export type CalendarEvent = {
  id: string
  title: string
  /** epoch ms */
  start: number
  /** epoch ms */
  end: number
  allDay: boolean
  notes?: string
  /** Minutes before `start` to fire a reminder notification. Omit for none. */
  reminderMinutes?: number
  /** Guards the reminder from firing more than once per occurrence. Reset
   * whenever `start` or `reminderMinutes` is edited. */
  reminderFired?: boolean
}

export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'reminderFired'>

/** What the create/edit dialog is currently doing, if anything. */
export type EventDialogState =
  | { mode: 'create'; start: number; end: number; allDay: boolean }
  | { mode: 'edit'; event: CalendarEvent }
