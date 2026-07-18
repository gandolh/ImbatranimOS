import { useEffect } from 'react'
import { notify } from '@imbatranim/core'
import { getClockState, useClockStore } from './clockStore'
import { currentHHmm } from './format'

/**
 * One interval (~1/sec), mounted once at the app root (see Clock.tsx) so it
 * keeps running no matter which tab is active — checks:
 *   - enabled alarms against the current wall-clock HH:mm
 *   - a running timer that has reached zero
 * and raises `notify(...)` for each. This is the ONLY place that fires
 * notifications; there is no background/service-worker daemon, so alarms and
 * timers only fire while this window is open (surfaced in the UI).
 */
export function useClockNotifications(): void {
  useEffect(() => {
    const id = setInterval(() => {
      const state = getClockState()
      const now = new Date()
      const hhmm = currentHHmm(now)
      const minuteKey = `${now.toDateString()} ${hhmm}`

      for (const alarm of state.alarms) {
        if (!alarm.enabled) continue
        if (alarm.time !== hhmm) continue
        if (alarm.lastFiredAt === minuteKey) continue
        useClockStore.getState().markAlarmFired(alarm.id, minuteKey)
        notify({
          title: 'Alarm',
          body: alarm.label ? `${alarm.label} — ${alarm.time}` : `It's ${alarm.time}`,
          appId: 'clock',
          level: 'info',
        })
      }

      const { timer } = state
      if (timer.running && timer.endAt !== null && !timer.fired && Date.now() >= timer.endAt) {
        useClockStore.getState().completeTimer()
        notify({
          title: 'Timer finished',
          body: 'Your countdown timer reached zero.',
          appId: 'clock',
          level: 'info',
        })
      }
    }, 1000)

    return () => clearInterval(id)
  }, [])
}
