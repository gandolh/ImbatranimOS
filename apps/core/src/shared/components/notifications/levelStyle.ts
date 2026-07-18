import type { NotificationLevel } from '../../store/notificationStore'

/**
 * Level → color/stripe classes + relative-time formatting. No new palette:
 * `error` uses the theme's error token; every other level uses the accent
 * (primary). Levels are told apart by icon shape (see `LevelIcon`), not by
 * inventing colors — identity is locked B&W + one accent.
 */

/** Text/icon color class for a level. */
export function levelColorClass(level: NotificationLevel): string {
  return level === 'error' ? 'text-error' : 'text-primary'
}

/** Left accent-stripe background class for a level. */
export function levelStripeClass(level: NotificationLevel): string {
  return level === 'error' ? 'bg-error' : 'bg-primary'
}

/** Relative time — tiny, dependency-free (avoids a dayjs plugin setup). */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}
