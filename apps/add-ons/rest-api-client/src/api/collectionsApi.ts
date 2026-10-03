import type { SystemHttp } from '@imbatranim/ui'
import type { Environment, HistoryEntry, RestClientData, SavedRequest } from '../types'

// Web-OS identity: user data lives in the home volume, not localStorage. We
// persist to a single JSON doc under ~/.config/rest-client/ via the authed
// files API (PUT/GET /files/content). writeFile mkdir -p's the parent dirs.
const ROOT = 'home'
const PATH = '.config/rest-client/collections.json'

/** History is bounded so the doc can't grow without limit. */
const MAX_HISTORY = 50

export const EMPTY_DATA: RestClientData = {
  collections: [],
  history: [],
  environments: [],
  activeEnvId: null,
}

/**
 * Coerce an unknown parsed doc into a valid RestClientData (defensive).
 *
 * Every field is checked independently so a file written before brief 77 — which had
 * no `environments` or `activeEnvId` — loads with its collections and history intact
 * rather than degrading to EMPTY_DATA. A dangling `activeEnvId` is dropped here, so
 * the send path never has to cope with one.
 */
function normalize(raw: unknown): RestClientData {
  const doc = (raw ?? {}) as Partial<RestClientData>
  const collections = Array.isArray(doc.collections) ? (doc.collections as SavedRequest[]) : []
  const history = Array.isArray(doc.history) ? (doc.history as HistoryEntry[]) : []
  const environments = Array.isArray(doc.environments)
    ? (doc.environments as Environment[]).filter(
        (env) => typeof env?.id === 'string' && Array.isArray(env?.vars)
      )
    : []
  const activeEnvId =
    typeof doc.activeEnvId === 'string' && environments.some((e) => e.id === doc.activeEnvId)
      ? doc.activeEnvId
      : null
  return { collections, history: history.slice(0, MAX_HISTORY), environments, activeEnvId }
}

/** Where the doc lives, for the "open it in Notepad" repair path. */
export const DATA_FILE = { root: ROOT, path: PATH } as const

/**
 * What `loadData` found. Only `ok` and `missing` may be written over: `missing` is
 * a first run, where empty data is the truth, and anything else is data the user
 * has not seen, which a whole-file save would replace (brief 139).
 */
export type LoadResult =
  | { status: 'ok'; data: RestClientData }
  | { status: 'missing' }
  | { status: 'failed'; error: string; malformed: boolean }

/** The HTTP status of an axios-style error, if it carries one. */
function httpStatus(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * Load collections + history.
 *
 * Before brief 139 every failure here degraded to empty data: a 401, a 503, a
 * network blip and a hand-edited file with a typo all looked like a first run, and
 * the next Send then saved that empty doc over the user's collections. Now only a
 * 404 means "start empty"; everything else is reported, and the caller refuses to
 * persist until a load succeeds.
 */
export async function loadData(http: SystemHttp): Promise<LoadResult> {
  let content: string
  try {
    const res = await http.get<{ path: string; content: string }>('/files/content', {
      params: { root: ROOT, path: PATH },
    })
    content = res.data.content
  } catch (err) {
    const status = httpStatus(err)
    if (status === 404) return { status: 'missing' }
    const message = (err as { message?: unknown })?.message
    return {
      status: 'failed',
      error: status
        ? `the files service answered ${status}`
        : typeof message === 'string' && message
          ? message
          : 'the file could not be read',
      malformed: false,
    }
  }
  try {
    return { status: 'ok', data: normalize(JSON.parse(content)) }
  } catch (err) {
    // V8's message already carries the position ("… at position 42 (line 3 column 5)").
    return {
      status: 'failed',
      error: `collections.json is not valid JSON: ${(err as Error).message}`,
      malformed: true,
    }
  }
}

/** Persist collections + history (history clamped to MAX_HISTORY). */
export async function saveData(http: SystemHttp, data: RestClientData): Promise<void> {
  const bounded: RestClientData = {
    collections: data.collections,
    history: data.history.slice(0, MAX_HISTORY),
    environments: data.environments,
    activeEnvId: data.activeEnvId,
  }
  await http.put('/files/content', {
    root: ROOT,
    path: PATH,
    content: JSON.stringify(bounded, null, 2),
  })
}
