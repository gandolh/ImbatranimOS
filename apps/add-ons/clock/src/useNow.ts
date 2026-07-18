import { useEffect, useState } from 'react'

/**
 * Ticks a `Date.now()` timestamp on an interval so a component re-renders to
 * show a live clock/countdown. The returned number is ONLY a render trigger —
 * callers should always recompute elapsed/remaining time from their own
 * stored timestamps (Date.now() - startedAt, etc.) rather than trusting tick
 * counts, so drift/throttling never accumulates.
 *
 * Pass `active = false` to stop ticking (e.g. a paused stopwatch) without
 * unmounting the component.
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])

  return now
}
