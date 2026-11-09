// Shapes and helpers for apps installed from a URL.

import type { AppSource, MarketplaceApp } from '../../shared/registry/marketplace'

/**
 * The backend's answer to `POST marketplace/url/inspect` (contract B).
 *
 * `runtime` is how the app would run: `native` for one built from source,
 * `sandboxed` for a prebuilt one (and for a backend that sends none). A native
 * app installs at once when `verified`; otherwise the owner must trust it.
 */
export type Inspection = {
  pending: string
  id: string
  runtime?: 'native' | 'sandboxed'
  verified?: boolean
  /** A native app's build type: `service` runs a server of its own. */
  type?: 'static' | 'service'
  /** A native app's apps, when it has several. */
  apps?: { id: string; name: string; icon: string; capabilities: string[] }[]
  manifest: {
    name: string
    description: string
    meta: string[]
    icon: string
    capabilities: string[]
  }
  source: UrlSource
  current: { commit: string } | null
}

export type UrlSource = AppSource

export function apiMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
  return typeof data?.message === 'string' ? data.message : fallback
}

export function sourceLine(source: UrlSource): string {
  const repo = source.repo.replace(/^https?:\/\//, '')
  const parts = [repo, source.ref ?? 'default branch']
  parts.push(source.commit.slice(0, 7))
  if (source.subdir) parts.push(`in ${source.subdir}`)
  return parts.join(' · ')
}

/**
 * The publisher of an app from a URL: the GitHub owner and repository (or the
 * local path, for a `file:` repository in development).
 */
export function publisher(source: UrlSource): string {
  return source.repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/^file:\/\//, '')
}

export const CAPABILITY_TEXT: Record<string, string> = {
  fs: 'Read and write the files you give it, and keep its own',
  http: "Call this machine's backend as you",
  intents: 'Open other apps, and files with them',
  notify: 'Show notifications',
  shortcuts: 'Add keyboard shortcuts',
  schedule: 'Set alarms and reminders',
}

/**
 * A capability in plain words, or its own name. The name comes from the app's
 * manifest, so it is looked up as an own key only: `CAPABILITY_TEXT['toString']`
 * would be a function.
 */
export function capabilityText(capability: string): string {
  return Object.hasOwn(CAPABILITY_TEXT, capability) ? CAPABILITY_TEXT[capability] : capability
}

/**
 * A URL app's badge. Verified only while the verified list this OS carries
 * names its installed commit; a commit the owner trusted says so; one that
 * was verified when installed and that a later release no longer lists says
 * that instead. A backend that sends no `verified` reads as the record says.
 */
export function trustBadge(trust: NonNullable<MarketplaceApp['trust']>): {
  label: string
  warn: boolean
} {
  if (trust.verified ?? trust.by === 'verified') return { label: 'Verified', warn: false }
  if (trust.by === 'owner') return { label: 'Trusted by you', warn: false }
  return { label: 'No longer verified', warn: true }
}
