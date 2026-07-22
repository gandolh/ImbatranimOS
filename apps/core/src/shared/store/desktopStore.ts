import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clampIconPosition, healIconPositions } from '../../lib/desktopBounds'

type IconPosition = {
  x: number
  y: number
}

type DesktopStore = {
  iconPositions: Record<string, IconPosition>
  updateIconPosition: (appId: string, position: IconPosition) => void
}

export const useDesktopStore = create<DesktopStore>()(
  persist(
    (set) => ({
      iconPositions: {},
      updateIconPosition: (appId, position) =>
        set((state) => ({
          iconPositions: {
            ...state.iconPositions,
            // Clamp on write so no drag/init can persist an off-desktop icon.
            [appId]: clampIconPosition(position),
          },
        })),
    }),
    {
      name: 'desktop-storage',
      // Self-heal on hydration: re-clamp every persisted position into the
      // current bounds so existing (possibly out-of-bounds) blobs recover.
      merge: (persisted, current) => {
        const prev = (persisted ?? {}) as Partial<DesktopStore>
        return {
          ...current,
          ...prev,
          iconPositions: healIconPositions(prev.iconPositions ?? {}),
        }
      },
    }
  )
)
