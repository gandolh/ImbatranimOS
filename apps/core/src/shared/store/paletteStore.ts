import { create } from 'zustand'

/**
 * Global command-palette open state. Lifted out of App.tsx so any surface (the
 * Mod+K hotkey, the taskbar Search button) can open the palette without prop
 * drilling.
 */
type PaletteStore = {
  open: boolean
  setOpen: (open: boolean) => void
  openPalette: () => void
}

export const usePaletteStore = create<PaletteStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  openPalette: () => set({ open: true }),
}))
