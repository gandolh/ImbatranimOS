import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createPrefsStorage } from '../../lib/prefs'

export type Wallpaper = 'dots' | 'grid' | 'linen'

type WallpaperStore = {
  wallpaper: Wallpaper
  setWallpaper: (w: Wallpaper) => void
}

export const useWallpaperStore = create<WallpaperStore>()(
  persist(
    (set) => ({
      wallpaper: 'dots',
      setWallpaper: (w) => set({ wallpaper: w }),
    }),
    {
      name: 'wallpaper',
      storage: createJSONStorage(() => createPrefsStorage('wallpaper')),
    }
  )
)
