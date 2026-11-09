export type SavedTab = { root: string; path: string }

const KEY = 'imbatranimos:code-editor:tabs'

/**
 * Remember which files each editor window had open, for the length of a
 * browser session.
 *
 * `PersistedWindow` stores no window id, so ids are freshly minted on every
 * reload and a record can't be matched back to the window it came from. So
 * each window records its own tab set under its id, and after a reload each
 * editor window that mounts claims one of the sets recorded before the
 * reload: two windows' tabs come back in two windows, in whichever order the
 * windows mount. (One shared record used to hold the last-saved set only, so
 * with two windows open the other's tabs were lost.)
 *
 * `sessionStorage`, not `localStorage`: these are session state, not
 * a durable dotfile, and a tab list that outlives the browser session would be
 * a config store nobody asked for. Untitled tabs are never recorded — their
 * contents are not on disk, so "restoring" one would restore an empty buffer
 * wearing the name of work that is gone. A window closed on purpose drops its
 * set ({@link forgetTabSession}); one open when the page went keeps it.
 */
type SessionRecord = { [windowId: string]: SavedTab[] }

function isTab(t: unknown): t is SavedTab {
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof (t as SavedTab).root === 'string' &&
    typeof (t as SavedTab).path === 'string'
  )
}

function readRecord(): SessionRecord {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    // The record before windows had their own: one shared list.
    if (Array.isArray(parsed)) {
      const tabs = parsed.filter(isTab)
      return tabs.length > 0 ? { shared: tabs } : {}
    }
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: SessionRecord = {}
    for (const [id, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue
      const tabs = list.filter(isTab)
      if (tabs.length > 0) out[id] = tabs
    }
    return out
  } catch {
    return {}
  }
}

function writeRecord(record: SessionRecord): void {
  try {
    if (Object.keys(record).length === 0) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // quota exceeded or storage disabled — the session record is optional
  }
}

/** SessionRecord one window's on-disk tabs; an empty set drops the window's entry. */
export function saveTabSession(windowId: string, tabs: SavedTab[]): void {
  const record = readRecord()
  if (tabs.length > 0) record[windowId] = tabs
  else delete record[windowId]
  writeRecord(record)
}

/** A window closed on purpose: its tabs are not something to bring back. */
export function forgetTabSession(windowId: string): void {
  const record = readRecord()
  if (!(windowId in record)) return
  delete record[windowId]
  writeRecord(record)
}

/** Every recorded window's tab set. */
export function loadTabSession(): SavedTab[][] {
  return Object.values(readRecord())
}

// Module-scoped, so they reset on reload exactly as the window ids do.
/** The sets recorded before this page load, not yet claimed; read at the first claim. */
let pool: [string, SavedTab[]][] | null = null
/** What each window of this page load claimed, so asking again answers the same. */
const claimedBy = new Map<string, SavedTab[]>()

/**
 * Hand one recorded tab set to each editor window that mounts after a reload,
 * and nothing once the sets run out. The pool is what was recorded before
 * this page load: sets the running editors record afterwards are their own,
 * not something a later window picks up mid-session. A window asking again
 * (StrictMode runs the effect twice) gets the same answer, never a second
 * window's set. A claimed set leaves the record; its new window records it
 * again under its own id.
 */
export function claimTabSession(windowId: string): SavedTab[] {
  const already = claimedBy.get(windowId)
  if (already) return [...already]
  pool ??= Object.entries(readRecord())
  const next = pool.shift()
  const tabs = next ? next[1] : []
  claimedBy.set(windowId, tabs)
  if (next) {
    const record = readRecord()
    delete record[next[0]]
    writeRecord(record)
  }
  return [...tabs]
}

/** Test seam — the claims are module state and must be resettable. */
export function resetTabSessionClaim(): void {
  pool = null
  claimedBy.clear()
}
