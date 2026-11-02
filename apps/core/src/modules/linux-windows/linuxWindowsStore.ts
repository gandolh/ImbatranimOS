import { create } from 'zustand'

/** A Linux app's toplevel window and the OS window showing it. */
export type LinuxToplevel = {
  toplevel: number
  windowId: string
  title: string
  appId: string
  width: number
  height: number
}

type LinuxWindowsState = {
  /** Keyed by the OS window's id. */
  byWindow: Record<string, LinuxToplevel>
  add: (t: LinuxToplevel) => void
  update: (windowId: string, patch: Partial<LinuxToplevel>) => void
  remove: (windowId: string) => void
  clear: () => void
}

export const useLinuxWindowsStore = create<LinuxWindowsState>()((set) => ({
  byWindow: {},
  add: (t) => set((s) => ({ byWindow: { ...s.byWindow, [t.windowId]: t } })),
  update: (windowId, patch) =>
    set((s) => {
      const t = s.byWindow[windowId]
      return t ? { byWindow: { ...s.byWindow, [windowId]: { ...t, ...patch } } } : s
    }),
  remove: (windowId) =>
    set((s) => {
      if (!(windowId in s.byWindow)) return s
      const next = { ...s.byWindow }
      delete next[windowId]
      return { byWindow: next }
    }),
  clear: () => set({ byWindow: {} }),
}))

export function windowForToplevel(toplevel: number): LinuxToplevel | undefined {
  return Object.values(useLinuxWindowsStore.getState().byWindow).find(
    (t) => t.toplevel === toplevel
  )
}

/**
 * Each toplevel's canvas lives outside React: the pixels it holds are the
 * window's picture, and the host only resends what changed. The window body
 * mounts this element rather than rendering its own, so a remount (an error
 * boundary's reload, say) keeps the picture.
 */
const canvases = new Map<number, HTMLCanvasElement>()

export function canvasFor(toplevel: number): HTMLCanvasElement {
  let c = canvases.get(toplevel)
  if (!c) {
    c = document.createElement('canvas')
    c.dataset.linuxToplevel = String(toplevel)
    canvases.set(toplevel, c)
  }
  return c
}

export function dropCanvas(toplevel: number): void {
  canvases.get(toplevel)?.remove()
  canvases.delete(toplevel)
}

export function dropAllCanvases(): void {
  for (const c of canvases.values()) c.remove()
  canvases.clear()
}
