import { api } from '@imbatranim/core'
import type { HistoryEntry, RestClientData, SavedRequest } from '../types'

// Web-OS identity: user data lives in the home volume, not localStorage. We
// persist to a single JSON doc under ~/.config/rest-client/ via the authed
// files API (PUT/GET /files/content). writeFile mkdir -p's the parent dirs.
const ROOT = 'home'
const PATH = '.config/rest-client/collections.json'

/** History is bounded so the doc can't grow without limit. */
const MAX_HISTORY = 50

export const EMPTY_DATA: RestClientData = { collections: [], history: [] }

/** Coerce an unknown parsed doc into a valid RestClientData (defensive). */
function normalize(raw: unknown): RestClientData {
  const doc = (raw ?? {}) as Partial<RestClientData>
  const collections = Array.isArray(doc.collections) ? (doc.collections as SavedRequest[]) : []
  const history = Array.isArray(doc.history) ? (doc.history as HistoryEntry[]) : []
  return { collections, history: history.slice(0, MAX_HISTORY) }
}

/**
 * Load collections + history. A missing file (first run) yields empty data —
 * the 404 from the files API is expected, not an error to surface.
 */
export async function loadData(): Promise<RestClientData> {
  try {
    const res = await api.get<{ path: string; content: string }>('/files/content', {
      params: { root: ROOT, path: PATH },
    })
    return normalize(JSON.parse(res.data.content))
  } catch {
    return { collections: [], history: [] }
  }
}

/** Persist collections + history (history clamped to MAX_HISTORY). */
export async function saveData(data: RestClientData): Promise<void> {
  const bounded: RestClientData = {
    collections: data.collections,
    history: data.history.slice(0, MAX_HISTORY),
  }
  await api.put('/files/content', {
    root: ROOT,
    path: PATH,
    content: JSON.stringify(bounded, null, 2),
  })
}
