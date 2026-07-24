import type { StateStorage } from 'zustand/middleware'
import { api } from './axios'

/**
 * Server-backed "dotfile" prefs client.
 *
 * The four durable config surfaces (appearance, wallpaper, desktop icons,
 * disabled add-ons) persist to `GET/PUT /api/prefs` instead of localStorage so
 * they follow the user across tabs and devices. Each store keeps its zustand
 * `persist` middleware but swaps the storage backend for {@link createPrefsStorage},
 * a synchronous `StateStorage` over an in-memory cache. The cache is seeded once
 * at boot by {@link loadPrefs} (a single `GET /api/prefs`), after which every
 * store is re-hydrated. Writes are optimistic (local first) with a debounced
 * write-through `PUT`; the server wins on the next load.
 */

export type PrefKey = 'appearance' | 'wallpaper' | 'desktop' | 'addons'

const PREFS_URL = '/prefs'
const FLUSH_DELAY_MS = 500

// Raw persisted JSON strings (the zustand `{state, version}` envelope) keyed by
// pref key. Seeded by loadPrefs(); read synchronously by createPrefsStorage.
const cache = new Map<PrefKey, string>()

// One trailing-debounced flush timer per key so a burst of setItem calls
// (e.g. dragging the theme slider) coalesces into a single PUT.
const flushTimers = new Map<PrefKey, ReturnType<typeof setTimeout>>()

let hydrated = false

/** True once the boot-time GET /api/prefs has resolved at least once. */
export function isPrefsHydrated(): boolean {
  return hydrated
}

/**
 * Fetch every stored pref once and seed the in-memory cache. Must run only when
 * authenticated — `/api/prefs` 401s when logged out. Safe to call repeatedly
 * (e.g. after a re-login); it replaces the cache wholesale.
 */
export async function loadPrefs(): Promise<void> {
  const res = await api.get<Record<string, unknown>>(PREFS_URL)
  const data = res.data ?? {}
  cache.clear()
  for (const [key, value] of Object.entries(data)) {
    // The server stores JSON-parsed values; re-stringify so the StateStorage
    // hands zustand's createJSONStorage the exact envelope string it expects.
    cache.set(key as PrefKey, JSON.stringify(value))
  }
  if (Object.keys(data).length === 0) {
    await seedFromLegacyLocalStorage()
  }
  hydrated = true
}

/**
 * Drop the cache and any pending flushes. Call on logout so a subsequent login
 * re-fetches from the server rather than serving a stale user's prefs.
 */
export function resetPrefs(): void {
  cache.clear()
  for (const timer of flushTimers.values()) clearTimeout(timer)
  flushTimers.clear()
  hydrated = false
}

// Legacy localStorage keys used before the four dotfile stores moved to
// server-backed prefs, mapped to their current PrefKey. One-time migration
// target for {@link loadPrefs}; see the doc comment there.
const LEGACY_KEYS: Record<string, PrefKey> = {
  'imbatranimos:appearance': 'appearance',
  'wallpaper-storage': 'wallpaper',
  'desktop-storage': 'desktop',
  'imbatranimos:addons': 'addons',
}

/**
 * One-time migration: an empty server prefs map means either a fresh account
 * or one that predates server-backed prefs, in which case the legacy zustand
 * `persist` envelopes may still be sitting in localStorage under their old
 * keys. Adopt whatever parses onto the server in one bulk PUT, seed the
 * in-memory cache with the same values, then clear the legacy keys so this
 * never re-runs. Only called when findAll() came back empty, so an existing
 * (even partial) server map always wins and this never clobbers real data.
 */
async function seedFromLegacyLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return

  const found: string[] = []
  const seeded: Partial<Record<PrefKey, unknown>> = {}
  for (const [legacyKey, prefKey] of Object.entries(LEGACY_KEYS) as [string, PrefKey][]) {
    const raw = localStorage.getItem(legacyKey)
    if (raw == null) continue
    found.push(legacyKey)
    try {
      seeded[prefKey] = JSON.parse(raw)
    } catch {
      // Corrupt legacy envelope: leave that store on its defaults, but still
      // clear the key below so it isn't retried forever.
    }
  }
  if (found.length === 0) return

  if (Object.keys(seeded).length > 0) {
    try {
      await api.put(PREFS_URL, seeded)
    } catch {
      return // Leave localStorage untouched; retry migration on next boot.
    }
    for (const [prefKey, value] of Object.entries(seeded)) {
      cache.set(prefKey as PrefKey, JSON.stringify(value))
    }
  }
  for (const legacyKey of found) localStorage.removeItem(legacyKey)
}

function scheduleFlush(key: PrefKey, value: string): void {
  const existing = flushTimers.get(key)
  if (existing !== undefined) clearTimeout(existing)
  flushTimers.set(
    key,
    setTimeout(() => {
      flushTimers.delete(key)
      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        return
      }
      // Bulk-upsert a single key; the server merges rather than replaces.
      void api.put(PREFS_URL, { [key]: parsed }).catch(() => {
        // Best-effort write-through: a lost write recovers on next load, and a
        // 401 is surfaced by the axios interceptor's auth:unauthorized event.
      })
    }, FLUSH_DELAY_MS)
  )
}

/**
 * Synchronously drain every pending debounced flush: cancel each timer and
 * fire its PUT immediately via `fetch(..., { keepalive: true })` instead of
 * axios, so the request survives the tab closing/refreshing right after this
 * call returns. Must not `await` anything — by the time a promise settles the
 * page may already be gone. Call on tab hide/unload and before logout.
 */
export function flushPendingPrefs(): void {
  if (flushTimers.size === 0) return

  const pending = Array.from(flushTimers.entries())
  flushTimers.clear()

  const url = `${api.defaults?.baseURL ?? ''}${PREFS_URL}`
  for (const [key, timer] of pending) {
    clearTimeout(timer)
    const value = cache.get(key)
    if (value === undefined) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      continue
    }
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ [key]: parsed }),
    }).catch(() => {
      // Best-effort, same as the debounced path: a lost write recovers on
      // next load.
    })
  }
}

// Register once per module instance: a tab going hidden or unloading is the
// only way the 500ms debounce window can lose a write, so drain it eagerly
// on both signals (pagehide covers Safari, which doesn't fire visibilitychange
// reliably on unload).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPrefs()
  })
  window.addEventListener('pagehide', () => flushPendingPrefs())
}

function scheduleDelete(key: PrefKey): void {
  const existing = flushTimers.get(key)
  if (existing !== undefined) {
    clearTimeout(existing)
    flushTimers.delete(key)
  }
  void api.delete(`${PREFS_URL}/${key}`).catch(() => {})
}

/**
 * A synchronous `StateStorage` bound to one pref key. Reads come from the cache
 * seeded by {@link loadPrefs}; writes update the cache immediately (optimistic)
 * and schedule a debounced server write-through. Pass through
 * `createJSONStorage(() => createPrefsStorage(key))` so zustand still owns the
 * envelope/versioning/migration for each store.
 */
export function createPrefsStorage(key: PrefKey): StateStorage {
  return {
    getItem: () => cache.get(key) ?? null,
    setItem: (_name, value) => {
      cache.set(key, value)
      scheduleFlush(key, value)
    },
    removeItem: () => {
      cache.delete(key)
      scheduleDelete(key)
    },
  }
}
