import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the axios client the prefs module writes through.
const get = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock('./axios', () => ({ api: { get, put, delete: del } }))

// Imported lazily per-test after resetModules so the module-level cache/timers
// start clean each time.
async function load() {
  const mod = await import('./prefs')
  return mod
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  get.mockReset()
  put.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadPrefs → createPrefsStorage.getItem', () => {
  it('seeds the cache from the server and serves envelope strings synchronously', async () => {
    get.mockResolvedValue({ data: { appearance: { state: { theme: 'light' }, version: 0 } } })
    const { loadPrefs, createPrefsStorage, isPrefsHydrated } = await load()

    expect(isPrefsHydrated()).toBe(false)
    await loadPrefs()
    expect(isPrefsHydrated()).toBe(true)

    const storage = createPrefsStorage('appearance')
    expect(storage.getItem('appearance')).toBe(
      JSON.stringify({ state: { theme: 'light' }, version: 0 })
    )
    // A key absent from the server reads as null (store keeps its defaults).
    expect(createPrefsStorage('wallpaper').getItem('wallpaper')).toBeNull()
  })

  it('treats an empty prefs response as no stored values', async () => {
    get.mockResolvedValue({ data: {} })
    const { loadPrefs, createPrefsStorage } = await load()
    await loadPrefs()
    expect(createPrefsStorage('addons').getItem('addons')).toBeNull()
  })
})

describe('loadPrefs legacy localStorage migration', () => {
  function makeFakeLocalStorage(initial: Record<string, string>) {
    const store = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      store,
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('seeds the server + cache from legacy keys when the server map is empty, then clears them', async () => {
    get.mockResolvedValue({ data: {} })
    const fakeLocalStorage = makeFakeLocalStorage({
      'imbatranimos:appearance': JSON.stringify({ state: { theme: 'light' }, version: 0 }),
      'wallpaper-storage': JSON.stringify({ state: { wallpaper: 'linen' }, version: 0 }),
    })
    vi.stubGlobal('localStorage', fakeLocalStorage)

    const { loadPrefs, createPrefsStorage } = await load()
    await loadPrefs()

    expect(put).toHaveBeenCalledWith('/prefs', {
      appearance: { state: { theme: 'light' }, version: 0 },
      wallpaper: { state: { wallpaper: 'linen' }, version: 0 },
    })
    expect(createPrefsStorage('appearance').getItem('appearance')).toBe(
      JSON.stringify({ state: { theme: 'light' }, version: 0 })
    )
    expect(fakeLocalStorage.store.has('imbatranimos:appearance')).toBe(false)
    expect(fakeLocalStorage.store.has('wallpaper-storage')).toBe(false)
  })

  it('does not migrate when the server already has prefs', async () => {
    get.mockResolvedValue({ data: { appearance: { state: { theme: 'dark' }, version: 0 } } })
    const fakeLocalStorage = makeFakeLocalStorage({
      'imbatranimos:appearance': JSON.stringify({ state: { theme: 'light' }, version: 0 }),
    })
    vi.stubGlobal('localStorage', fakeLocalStorage)

    const { loadPrefs } = await load()
    await loadPrefs()

    expect(put).not.toHaveBeenCalled()
    expect(fakeLocalStorage.store.has('imbatranimos:appearance')).toBe(true)
  })

  it('skips a corrupt legacy value but still migrates the rest and clears both keys', async () => {
    get.mockResolvedValue({ data: {} })
    const fakeLocalStorage = makeFakeLocalStorage({
      'imbatranimos:appearance': 'not-json{{',
      'wallpaper-storage': JSON.stringify({ state: { wallpaper: 'grid' }, version: 0 }),
    })
    vi.stubGlobal('localStorage', fakeLocalStorage)

    const { loadPrefs } = await load()
    await loadPrefs()

    expect(put).toHaveBeenCalledWith('/prefs', {
      wallpaper: { state: { wallpaper: 'grid' }, version: 0 },
    })
    expect(fakeLocalStorage.store.has('imbatranimos:appearance')).toBe(false)
    expect(fakeLocalStorage.store.has('wallpaper-storage')).toBe(false)
  })
})

describe('setItem debounced write-through', () => {
  it('coalesces a burst into a single PUT of the latest value', async () => {
    const { createPrefsStorage } = await load()
    const storage = createPrefsStorage('appearance')

    storage.setItem('appearance', JSON.stringify({ state: { accent: 'a' }, version: 0 }))
    storage.setItem('appearance', JSON.stringify({ state: { accent: 'b' }, version: 0 }))
    storage.setItem('appearance', JSON.stringify({ state: { accent: 'c' }, version: 0 }))

    // Optimistic: the cache reflects the latest write immediately, before flush.
    expect(storage.getItem('appearance')).toBe(
      JSON.stringify({ state: { accent: 'c' }, version: 0 })
    )
    expect(put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('/prefs', {
      appearance: { state: { accent: 'c' }, version: 0 },
    })
  })

  it('flushes distinct keys independently', async () => {
    const { createPrefsStorage } = await load()
    createPrefsStorage('appearance').setItem(
      'appearance',
      JSON.stringify({ state: {}, version: 0 })
    )
    createPrefsStorage('wallpaper').setItem('wallpaper', JSON.stringify({ state: {}, version: 0 }))

    await vi.advanceTimersByTimeAsync(500)
    expect(put).toHaveBeenCalledTimes(2)
  })
})

describe('removeItem', () => {
  it('deletes the key server-side and clears any pending flush', async () => {
    const { createPrefsStorage } = await load()
    const storage = createPrefsStorage('addons')

    storage.setItem('addons', JSON.stringify({ state: { disabled: [] }, version: 0 }))
    storage.removeItem('addons')

    await vi.advanceTimersByTimeAsync(500)
    // The pending PUT was cancelled; only the DELETE fired.
    expect(put).not.toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('/prefs/addons')
    expect(storage.getItem('addons')).toBeNull()
  })
})

describe('flushPendingPrefs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends every pending write immediately via keepalive fetch and clears timers', async () => {
    const { createPrefsStorage, flushPendingPrefs } = await load()
    createPrefsStorage('appearance').setItem(
      'appearance',
      JSON.stringify({ state: { accent: 'x' }, version: 0 })
    )
    createPrefsStorage('wallpaper').setItem(
      'wallpaper',
      JSON.stringify({ state: { wallpaper: 'linen' }, version: 0 })
    )

    flushPendingPrefs()

    expect(fetch).toHaveBeenCalledTimes(2)
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    for (const [, init] of calls) {
      expect(init).toMatchObject({ method: 'PUT', keepalive: true, credentials: 'include' })
    }
    expect(put).not.toHaveBeenCalled()

    // The debounced timers were cancelled, so nothing fires again at 500ms.
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(put).not.toHaveBeenCalled()
  })

  it('is a no-op when nothing is pending', async () => {
    const { flushPendingPrefs } = await load()
    expect(() => flushPendingPrefs()).not.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resetPrefs', () => {
  it('clears the cache and cancels pending flushes on logout', async () => {
    get.mockResolvedValue({ data: { wallpaper: { state: { wallpaper: 'grid' }, version: 0 } } })
    const { loadPrefs, resetPrefs, createPrefsStorage, isPrefsHydrated } = await load()
    await loadPrefs()

    const storage = createPrefsStorage('wallpaper')
    storage.setItem('wallpaper', JSON.stringify({ state: { wallpaper: 'linen' }, version: 0 }))

    resetPrefs()
    expect(isPrefsHydrated()).toBe(false)
    expect(storage.getItem('wallpaper')).toBeNull()

    await vi.advanceTimersByTimeAsync(500)
    expect(put).not.toHaveBeenCalled()
  })
})
