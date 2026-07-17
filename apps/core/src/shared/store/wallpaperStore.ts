import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
      name: 'wallpaper-storage',
    }
  )
)
