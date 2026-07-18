import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorldClock = {
  id: string
  label: string
  timeZone: string
}

export type Alarm = {
  id: string
  label: string
  /** 24h "HH:mm", local wall-clock time. */
  time: string
  enabled: boolean
  /**
   * Guard against double-firing within the same minute: the last
   * "<toDateString()> HH:mm" key this alarm actually notified for.
   * Persisted alongside the alarm — harmless across reloads, and it means an
   * alarm that already fired this minute won't fire again if the app
   * reopens inside that same minute.
   */
  lastFiredAt: string | null
}

type StopwatchState = {
  /** Timestamp the current running segment started, or null when paused/reset. */
  startedAt: number | null
  /** Elapsed ms accumulated from previous run segments. */
  accumulatedMs: number
  running: boolean
  /** Lap elapsed-ms readings, newest first. */
  laps: number[]
}

type TimerState = {
  /** Configured countdown length — restored on reset. */
  durationMs: number
  /** Timestamp the countdown reaches zero, set only while running. */
  endAt: number | null
  /** Remaining ms snapshot while paused (or before the first start). */
  pausedRemainingMs: number
  running: boolean
  /** True once notify() has fired for the current run — prevents re-firing. */
  fired: boolean
}

const initialStopwatch: StopwatchState = {
  startedAt: null,
  accumulatedMs: 0,
  running: false,
  laps: [],
}

const DEFAULT_TIMER_MS = 5 * 60 * 1000

const initialTimer: TimerState = {
  durationMs: DEFAULT_TIMER_MS,
  endAt: null,
  pausedRemainingMs: DEFAULT_TIMER_MS,
  running: false,
  fired: false,
}

type ClockStore = {
  // --- persisted: world clocks + alarms -----------------------------------
  worldClocks: WorldClock[]
  addWorldClock: (label: string, timeZone: string) => void
  removeWorldClock: (id: string) => void

  alarms: Alarm[]
  addAlarm: (label: string, time: string) => void
  removeAlarm: (id: string) => void
  toggleAlarm: (id: string) => void
  markAlarmFired: (id: string, firedAtKey: string) => void

  // --- session-only: stopwatch ---------------------------------------------
  stopwatch: StopwatchState
  startStopwatch: () => void
  stopStopwatch: () => void
  lapStopwatch: () => void
  resetStopwatch: () => void

  // --- session-only: timer --------------------------------------------------
  timer: TimerState
  setTimerDuration: (ms: number) => void
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  /** Called by the notification watcher once the countdown hits zero. */
  completeTimer: () => void
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`

export const useClockStore = create<ClockStore>()(
  persist(
    (set) => ({
      worldClocks: [],
      addWorldClock: (label, timeZone) =>
        set((s) => ({
          worldClocks: [...s.worldClocks, { id: newId(), label, timeZone }],
        })),
      removeWorldClock: (id) =>
        set((s) => ({ worldClocks: s.worldClocks.filter((w) => w.id !== id) })),

      alarms: [],
      addAlarm: (label, time) =>
        set((s) => ({
          alarms: [...s.alarms, { id: newId(), label, time, enabled: true, lastFiredAt: null }],
        })),
      removeAlarm: (id) => set((s) => ({ alarms: s.alarms.filter((a) => a.id !== id) })),
      toggleAlarm: (id) =>
        set((s) => ({
          alarms: s.alarms.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
        })),
      markAlarmFired: (id, firedAtKey) =>
        set((s) => ({
          alarms: s.alarms.map((a) => (a.id === id ? { ...a, lastFiredAt: firedAtKey } : a)),
        })),

      stopwatch: initialStopwatch,
      startStopwatch: () =>
        set((s) =>
          s.stopwatch.running
            ? s
            : { stopwatch: { ...s.stopwatch, running: true, startedAt: Date.now() } }
        ),
      stopStopwatch: () =>
        set((s) => {
          if (!s.stopwatch.running || s.stopwatch.startedAt === null) return s
          return {
            stopwatch: {
              ...s.stopwatch,
              running: false,
              startedAt: null,
              accumulatedMs: s.stopwatch.accumulatedMs + (Date.now() - s.stopwatch.startedAt),
            },
          }
        }),
      lapStopwatch: () =>
        set((s) => {
          const { stopwatch } = s
          const elapsed =
            stopwatch.accumulatedMs +
            (stopwatch.running && stopwatch.startedAt !== null
              ? Date.now() - stopwatch.startedAt
              : 0)
          return { stopwatch: { ...stopwatch, laps: [elapsed, ...stopwatch.laps] } }
        }),
      resetStopwatch: () => set({ stopwatch: initialStopwatch }),

      timer: initialTimer,
      setTimerDuration: (ms) =>
        set((s) =>
          s.timer.running
            ? s
            : { timer: { ...s.timer, durationMs: ms, pausedRemainingMs: ms, fired: false } }
        ),
      startTimer: () =>
        set((s) => {
          if (s.timer.running) return s
          const remaining =
            s.timer.pausedRemainingMs > 0 ? s.timer.pausedRemainingMs : s.timer.durationMs
          return {
            timer: {
              ...s.timer,
              running: true,
              fired: false,
              endAt: Date.now() + remaining,
              pausedRemainingMs: remaining,
            },
          }
        }),
      pauseTimer: () =>
        set((s) => {
          if (!s.timer.running || s.timer.endAt === null) return s
          const remaining = Math.max(0, s.timer.endAt - Date.now())
          return {
            timer: { ...s.timer, running: false, endAt: null, pausedRemainingMs: remaining },
          }
        }),
      resetTimer: () =>
        set((s) => ({
          timer: {
            ...s.timer,
            running: false,
            endAt: null,
            pausedRemainingMs: s.timer.durationMs,
            fired: false,
          },
        })),
      completeTimer: () =>
        set((s) => ({
          timer: { ...s.timer, running: false, endAt: null, pausedRemainingMs: 0, fired: true },
        })),
    }),
    {
      name: 'imbatranimos:clock',
      // Stopwatch/timer are session-only — never resurrect a running
      // countdown or stopwatch across a reload.
      partialize: (state) => ({ worldClocks: state.worldClocks, alarms: state.alarms }),
    }
  )
)

// Re-exported for callers that just need a fresh Date-based read without
// subscribing to the whole store (the notification watcher, tab displays).
export function getClockState() {
  return useClockStore.getState()
}
