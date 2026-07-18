import { useEffect } from 'react'
import { notify } from '@imbatranim/core'
import { useCalendarStore } from './calendarStore'

/** How often the reminder check runs while the tab is open. */
const CHECK_INTERVAL_MS = 60_000

/**
 * Window (after the trigger instant) during which a reminder may still fire.
 * Wide enough that a ~1/min interval never misses a trigger to timer drift,
 * narrow enough that reopening the app long after a trigger has passed
 * (e.g. the tab was closed for days) doesn't dump a wave of stale toasts.
 */
const FIRE_WINDOW_MS = 90_000

/**
 * Fires a `notify(...)` toast once per event occurrence when `now` crosses
 * `start - reminderMinutes`. Runs a single ~1/min interval for as long as
 * this hook stays mounted — reminders only fire while the Calendar window is
 * open in this tab; there is no background/service-worker delivery. Mount
 * this exactly once, from the root Calendar component, and let it clean up
 * its interval on unmount.
 */
export function useCalendarReminders(): void {
  useEffect(() => {
    function check() {
      const { events, markReminderFired } = useCalendarStore.getState()
      const now = Date.now()
      for (const event of events) {
        if (event.reminderFired || !event.reminderMinutes) continue
        const trigger = event.start - event.reminderMinutes * 60_000
        if (now >= trigger && now < trigger + FIRE_WINDOW_MS) {
          notify({ title: event.title, body: 'Starting soon', appId: 'calendar', level: 'info' })
          markReminderFired(event.id)
        }
      }
    }

    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
}
