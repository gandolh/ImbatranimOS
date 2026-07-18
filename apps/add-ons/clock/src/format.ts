/** Formatting helpers — pure functions, no React, no component exports. */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** "HH:MM:SS" from a millisecond duration (clamped to >= 0). */
export function formatClockDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/** "MM:SS.CC" (centiseconds) — used by the stopwatch for its extra precision. */
export function formatStopwatch(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalCentis = Math.floor(clamped / 10)
  const centis = totalCentis % 100
  const totalSeconds = Math.floor(totalCentis / 100)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${pad2(m)}:${pad2(s)}.${pad2(centis)}`
}

/** Local wall-clock time as HH:mm (24h), used for alarm matching. */
export function currentHHmm(now: Date): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

/** Time-of-day in a given IANA zone, e.g. "14:07:52". */
export function formatTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

/** Date-of-day in a given IANA zone, e.g. "Sat, Jul 18". */
export function formatDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** UTC offset label for a zone at a given instant, e.g. "GMT+05:30". */
export function formatUtcOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}
