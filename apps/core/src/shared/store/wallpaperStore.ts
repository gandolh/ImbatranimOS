import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { prefsStorage } from '../../lib/prefs'
import { useAppearanceStore, type ThemeId } from './appearanceStore'

export type ClassicWallpaper = 'dots' | 'grid' | 'linen'
export type ApricotWallpaper = 'sunset-hills' | 'plain' | 'soft-dots'
export type Wallpaper = ClassicWallpaper | ApricotWallpaper

export const WALLPAPER_IDS: Record<ThemeId, readonly Wallpaper[]> = {
  apricot: ['sunset-hills', 'plain', 'soft-dots'],
  classic: ['dots', 'grid', 'linen'],
}

export const DEFAULT_WALLPAPERS: Record<ThemeId, Wallpaper> = {
  apricot: 'sunset-hills',
  classic: 'dots',
}

type WallpaperState = {
  /** The wallpaper chosen in each theme. */
  wallpapers: Record<ThemeId, Wallpaper>
}

type WallpaperStore = WallpaperState & {
  /** Sets the wallpaper of the current theme. */
  setWallpaper: (w: Wallpaper) => void
}

function isWallpaperOf(theme: ThemeId, id: unknown): id is Wallpaper {
  return (WALLPAPER_IDS[theme] as readonly unknown[]).includes(id)
}

/**
 * Read a saved wallpaper blob of any age.
 *
 * Before themes the blob was `{ wallpaper }`, one of Classic's three. It
 * becomes Classic's choice, and Apricot starts on its default, sunset hills.
 */
export function readWallpapers(saved: unknown): WallpaperState {
  const s = (saved ?? {}) as Record<string, unknown>
  if ('wallpaper' in s) {
    return {
      wallpapers: {
        ...DEFAULT_WALLPAPERS,
        classic: isWallpaperOf('classic', s.wallpaper) ? s.wallpaper : DEFAULT_WALLPAPERS.classic,
      },
    }
  }
  const w = (s.wallpapers ?? {}) as Record<string, unknown>
  return {
    wallpapers: {
      apricot: isWallpaperOf('apricot', w.apricot) ? w.apricot : DEFAULT_WALLPAPERS.apricot,
      classic: isWallpaperOf('classic', w.classic) ? w.classic : DEFAULT_WALLPAPERS.classic,
    },
  }
}

export const useWallpaperStore = create<WallpaperStore>()(
  persist(
    (set) => ({
      wallpapers: DEFAULT_WALLPAPERS,
      setWallpaper: (w) =>
        set((s) => {
          const theme = useAppearanceStore.getState().theme
          return isWallpaperOf(theme, w) ? { wallpapers: { ...s.wallpapers, [theme]: w } } : s
        }),
    }),
    {
      name: 'wallpaper-storage',
      /**
       * Server-backed dotfile: durable user config that belongs to the
       * account, not to one browser. `prefsStorage` mirrors to localStorage for
       * the pre-auth first paint and writes through to `/api/prefs`.
       */
      storage: createJSONStorage(() => prefsStorage),
      // Version 0 is the blob from before themes; see readWallpapers.
      version: 1,
      migrate: (saved) => readWallpapers(saved),
      merge: (saved, current) =>
        saved === undefined ? current : { ...current, ...readWallpapers(saved) },
      partialize: ({ wallpapers }) => ({ wallpapers }),
    }
  )
)

/** The current theme's wallpaper. */
export function useCurrentWallpaper(): Wallpaper {
  const theme = useAppearanceStore((s) => s.theme)
  return useWallpaperStore((s) => s.wallpapers[theme])
}
