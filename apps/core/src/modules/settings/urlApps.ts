// Shapes and helpers for apps installed from a URL (brief 158).

import type { AppSource } from '../../shared/registry/marketplace'

/** The backend's answer to `POST marketplace/url/inspect` (brief 158, contract B). */
export type Inspection = {
  pending: string
  id: string
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

export const CAPABILITY_TEXT: Record<string, string> = {
  notify: 'Show notifications',
}

/**
 * A capability in plain words, or its own name. The name comes from the app's
 * manifest, so it is looked up as an own key only: `CAPABILITY_TEXT['toString']`
 * would be a function.
 */
export function capabilityText(capability: string): string {
  return Object.hasOwn(CAPABILITY_TEXT, capability) ? CAPABILITY_TEXT[capability] : capability
}
