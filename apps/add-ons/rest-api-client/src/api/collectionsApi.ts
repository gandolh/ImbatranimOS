import { FileConflictError, type SystemHandle } from '@imbatranim/ui'
import type { Environment, HistoryEntry, RestClientData, SavedRequest } from '../types'

/*
 * The collections, history and environments are one JSON doc in the app's
 * data folder (`system.data`, kind `data`): ~/.local/share/imbatranim/
 * rest-api-client/collections.json. Before the app had a folder the doc lived
 * at ~/.config/rest-client/collections.json; the first load that finds no
 * doc in the folder moves that one in, and removes it once the copy reads
 * back the same.
 */
const DATA_PATH = 'collections.json'
const LEGACY_DIR = '.config/rest-client'
const LEGACY = { root: 'home', path: `${LEGACY_DIR}/collections.json` } as const

/** History is bounded so the doc can't grow without limit. */
const MAX_HISTORY = 50

/** What the store needs of the handle. */
export type CollectionsSystem = Pick<SystemHandle, 'data' | 'http'>

export const EMPTY_DATA: RestClientData = {
  collections: [],
  history: [],
  environments: [],
  activeEnvId: null,
}

/** A file in the home, for the "open it in Notepad" repair path. */
export type FileRef = { root: string; path: string }

/** Where the doc lives in the home, as Files and Notepad name it. */
export const DATA_FILE: FileRef = {
  root: 'home',
  path: `.local/share/imbatranim/rest-api-client/${DATA_PATH}`,
}

/**
 * Coerce an unknown parsed doc into a valid RestClientData (defensive).
 *
 * Every field is checked independently so a file written before the REST client work — which had
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

/**
 * What `loadData` found. Only `ok` and `missing` may be written over: `missing` is
 * a first run, where empty data is the truth, and anything else is data the user
 * has not seen, which a whole-file save would replace. `version` goes back with
 * the next save, so a save over a doc another window changed is refused.
 */
export type LoadResult =
  | { status: 'ok'; data: RestClientData; version: string }
  | { status: 'missing' }
  | { status: 'failed'; error: string; malformed: boolean; file?: FileRef }

/** The HTTP status of an axios-style error, if it carries one. */
function httpStatus(err: unknown): number | undefined {
  const status = (err as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

function failed(err: unknown, what: string): LoadResult {
  const status = httpStatus(err)
  const message = (err as { message?: unknown })?.message
  return {
    status: 'failed',
    error: status
      ? `${what} answered ${status}`
      : typeof message === 'string' && message
        ? message
        : 'the file could not be read',
    malformed: false,
  }
}

function parse(content: string, file: FileRef): LoadResult | RestClientData {
  try {
    return normalize(JSON.parse(content))
  } catch (err) {
    // V8's message already carries the position ("… at position 42 (line 3 column 5)").
    return {
      status: 'failed',
      error: `collections.json is not valid JSON: ${(err as Error).message}`,
      malformed: true,
      file,
    }
  }
}

const isResult = (value: LoadResult | RestClientData): value is LoadResult => 'status' in value

/**
 * Load collections + history.
 *
 * Only a missing doc means "start empty"; every other failure is reported, and
 * the caller refuses to persist until a load succeeds, so a blip never reads as
 * a first run whose next save replaces the user's collections.
 */
export async function loadData(system: CollectionsSystem): Promise<LoadResult> {
  return load(system, 2)
}

async function load(system: CollectionsSystem, attempts: number): Promise<LoadResult> {
  const data = system.data
  if (!data) {
    return { status: 'failed', error: 'this desktop keeps no app data', malformed: false }
  }
  let stored
  try {
    stored = await data.read(DATA_PATH)
  } catch (err) {
    return failed(err, 'the data folder')
  }
  if (!stored) return moveLegacy(system, attempts)

  const parsed = parse(stored.content, DATA_FILE)
  if (isResult(parsed)) return parsed
  await dropLegacy(system, stored.content)
  return { status: 'ok', data: parsed, version: stored.version }
}

/**
 * Move the doc from where it was kept before the data folder, once.
 *
 * Safe to run again at any point: the copy is made only while the folder has
 * no doc (a second window that got there first wins, and this one reads
 * theirs), and the original goes only once the copy reads back byte for byte.
 * A malformed original is reported and left alone, moved nowhere.
 */
async function moveLegacy(system: CollectionsSystem, attempts: number): Promise<LoadResult> {
  let legacy: string
  try {
    const res = await system.http.get<{ content: string }>('/files/content', { params: LEGACY })
    legacy = res.data.content
  } catch (err) {
    // No old doc, or one this app may not read: nothing to move.
    const status = httpStatus(err)
    if (status === 404 || status === 403) return { status: 'missing' }
    return failed(err, 'the files service')
  }
  const parsed = parse(legacy, LEGACY)
  if (isResult(parsed)) return parsed

  let version: string
  try {
    ;({ version } = await system.data!.write(DATA_PATH, legacy, { expected: null }))
  } catch (err) {
    // Another window moved it first: read theirs.
    if (err instanceof FileConflictError && attempts > 0) return load(system, attempts - 1)
    return failed(err, 'the data folder')
  }
  // The original goes only once the copy reads back the same.
  const back = await system.data!.read(DATA_PATH).catch(() => null)
  if (back?.content === legacy) await dropLegacy(system, legacy)
  return { status: 'ok', data: parsed, version }
}

/**
 * Remove the old doc if it holds the same bytes as `copy`, the doc in the
 * folder: the move's last step, tried again on every load until it is done.
 * An old doc that differs (brought back by a restore, say) is the owner's,
 * and stays.
 */
async function dropLegacy(system: CollectionsSystem, copy: string): Promise<void> {
  try {
    const legacy = await system.http.get<{ content: string }>('/files/content', {
      params: LEGACY,
    })
    if (legacy.data.content !== copy) return
    await system.http.delete('/files', { params: LEGACY })
    // And its folder, once nothing else is in it.
    const rest = await system.http.get<unknown[]>('/files', {
      params: { root: LEGACY.root, path: LEGACY_DIR },
    })
    if (Array.isArray(rest.data) && rest.data.length === 0) {
      await system.http.delete('/files', { params: { root: LEGACY.root, path: LEGACY_DIR } })
    }
  } catch {
    // No old doc (the usual answer), or it couldn't go yet: the next load tries again.
  }
}

/**
 * Persist collections + history (history clamped to MAX_HISTORY), over the
 * version the last load or save saw, or as a new doc for null. Resolves the
 * doc's new version; throws `FileConflictError` when another window saved it
 * since.
 */
export async function saveData(
  system: CollectionsSystem,
  data: RestClientData,
  expected: string | null
): Promise<string> {
  if (!system.data) throw new Error('this desktop keeps no app data')
  const bounded: RestClientData = {
    collections: data.collections,
    history: data.history.slice(0, MAX_HISTORY),
    environments: data.environments,
    activeEnvId: data.activeEnvId,
  }
  const { version } = await system.data.write(DATA_PATH, JSON.stringify(bounded, null, 2), {
    expected,
  })
  return version
}
