import { useEffect, useState } from 'react'
import { loadPrefs } from './prefs'
import { useAppearanceStore, applyAppearance } from '../shared/store/appearanceStore'
import { useWallpaperStore } from '../shared/store/wallpaperStore'
import { useDesktopStore } from '../shared/store/desktopStore'
import { useAddonStore } from '../shared/store/addonStore'

/**
 * Boot-time prefs hydration gate.
 *
 * Runs once when the desktop mounts (which only happens after auth is
 * established — the desktop is gated behind AuthGate). Fetches the server-backed
 * prefs a single time, re-hydrates the four dotfile stores from the seeded
 * cache, then applies the resolved theme/accent imperatively BEFORE flipping the
 * gate open. Rendering the themed shell only after this resolves prevents a
 * flash of default appearance/wallpaper.
 *
 * Returns false while hydrating (caller should render a neutral placeholder),
 * true once the desktop is safe to paint.
 */
export function usePrefsBoot(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await loadPrefs()
        // Re-read each store from the now-seeded cache. persist.rehydrate()
        // re-runs each store's merge/version logic against the server state
        // (desktopStore's icon self-heal included).
        await Promise.all([
          useAppearanceStore.persist.rehydrate(),
          useWallpaperStore.persist.rehydrate(),
          useDesktopStore.persist.rehydrate(),
          useAddonStore.persist.rehydrate(),
        ])
      } catch {
        // Prefs unreachable: fall back to in-memory defaults rather than
        // blocking the desktop forever.
      }
      if (cancelled) return
      // Apply appearance from the freshly hydrated store so the very first paint
      // of the desktop already carries the correct CSS vars (no FOUC).
      const { theme, accent } = useAppearanceStore.getState()
      applyAppearance(theme, accent)
      setHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return hydrated
}
