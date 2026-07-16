import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
            [appId]: position,
          },
        })),
    }),
    {
      name: 'desktop-storage',
    }
  )
)
