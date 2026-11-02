import type { ArchiveIntent } from '../types'

/** The window's job state, mirrored from the component. */
export type Phase = 'idle' | 'listing' | 'browsing' | 'running' | 'done' | 'error'

/**
 * Accept the generic open payload as well as this app's own intents.
 *
 * Since default apps and Open with the manifest declares `opens: ['zip', 'tar', …]`, so
 * double-clicking an archive routes here through the same `{ openPath, root }`
 * payload every other opener gets. Without this translation the app would have
 * opened idle and empty — a double-click that technically launched something and
 * did nothing, which is the exact failure Open with exists to remove.
 *
 * "Open" means **browse**, not extract: `action: 'extract'` with no `dest` is
 * already the list-and-wait path the archive manager work built.
 */
export function normaliseIntent(raw: unknown): ArchiveIntent | null {
  if (raw === null || typeof raw !== 'object') return null
  const it = raw as Record<string, unknown>
  if (it.action === 'extract' || it.action === 'compress') return raw as ArchiveIntent
  if (typeof it.openPath === 'string' && typeof it.root === 'string') {
    return { action: 'extract', root: it.root, path: it.openPath }
  }
  return null
}

export type Delivery = 'run' | 'defer' | 'ignore'

/**
 * What to do with a payload that just arrived.
 *
 * Archive Manager is the only single-instance app that declares `opens`, so it
 * is the one app where re-delivery is visible: opening zip B while zip A is on
 * screen used to focus the window and silently drop B.
 *
 * A payload arriving mid-extraction is **deferred**, not run and not refused.
 * There is no job-cancel endpoint — "abandon" could not actually stop the
 * backend write, only orphan it — and the poll loop keeps running regardless.
 * So the new archive waits for the job to settle. In every other phase it wins
 * immediately. Several arrivals while running collapse to the newest: the
 * intent map holds one slot per window, so a deeper queue would be invented
 * state the store cannot back.
 */
export function deliveryFor(phase: Phase, intent: ArchiveIntent | null): Delivery {
  if (intent === null) return 'ignore'
  return phase === 'running' ? 'defer' : 'run'
}
