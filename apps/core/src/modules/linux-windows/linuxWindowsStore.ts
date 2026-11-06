import { create } from 'zustand'

export type Geometry = { x: number; y: number; width: number; height: number }

/** A Linux app's toplevel window and the OS window showing it. */
export type LinuxToplevel = {
  toplevel: number
  windowId: string
  title: string
  appId: string
  /** The app's image, in CSS pixels. */
  width: number
  height: number
  /** Image pixels per CSS pixel: 2 when the app draws for a scale-2 screen. */
  scale: number
  /** The part of the image that is the window; the rest is shadow. */
  geometry: Geometry
  /** `server`: the OS title bar. `client`: the app draws its own. */
  decorations: 'server' | 'client'
  /** The app's limits on its window size; 0 means none. */
  min: { width: number; height: number }
  max: { width: number; height: number }
}

/**
 * A menu, dropdown or tooltip a Linux app opened: drawn above its parent,
 * where the host placed it. Its id shares the toplevels' id space.
 */
export type LinuxPopup = {
  popup: number
  /** The toplevel or popup it opened from. */
  parent: number
  /** Its window geometry's top-left, relative to the parent's. */
  x: number
  y: number
  /** The image, in CSS pixels. */
  width: number
  height: number
  /** Image pixels per CSS pixel. */
  scale: number
  /** The part of the image that is the popup; the rest is shadow. */
  geometry: Geometry
  /** It holds an explicit grab: the host sends it the keys. */
  grab: boolean
}

/** A move or resize the app started from its own title bar or edge. */
export type LinuxRequest = { windowId: string; action: string; edges?: string; seq: number }

type LinuxWindowsState = {
  /** Keyed by the OS window's id. */
  byWindow: Record<string, LinuxToplevel>
  /** The cursor the session's apps asked for, as a CSS cursor. */
  cursor: string
  /** The latest drag the app asked for; the window body starts it. */
  request: LinuxRequest | null
  /** Open popups, by id. */
  popups: Record<number, LinuxPopup>
  add: (t: LinuxToplevel) => void
  update: (windowId: string, patch: Partial<LinuxToplevel>) => void
  remove: (windowId: string) => void
  clear: () => void
  setCursor: (cursor: string) => void
  setRequest: (r: Omit<LinuxRequest, 'seq'>) => void
  setPopup: (p: LinuxPopup) => void
  removePopup: (popup: number) => void
}

let requestSeq = 0

export const useLinuxWindowsStore = create<LinuxWindowsState>()((set) => ({
  byWindow: {},
  cursor: 'default',
  request: null,
  popups: {},
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
  clear: () => set({ byWindow: {}, request: null, cursor: 'default', popups: {} }),
  setCursor: (cursor) => set({ cursor }),
  setRequest: (r) => set({ request: { ...r, seq: ++requestSeq } }),
  setPopup: (p) => set((s) => ({ popups: { ...s.popups, [p.popup]: p } })),
  removePopup: (popup) =>
    set((s) => {
      if (!(popup in s.popups)) return s
      const next = { ...s.popups }
      delete next[popup]
      return { popups: next }
    }),
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

/**
 * When a Linux window last drew something big enough to be watched: a
 * frame of at least {@link DRAWING_AREA} pixels. A blinking caret or a small
 * spinner doesn't count; a video does.
 */
const DRAWING_AREA = 64 * 64
let lastDrawnAt = -Infinity

export function noteLinuxFrame(area: number): void {
  if (area >= DRAWING_AREA) lastDrawnAt = performance.now()
}

/** A Linux window drew within `ms`: it holds the idle cover off, as a playing video does. */
export function linuxWindowsDrawing(ms = 3000): boolean {
  return performance.now() - lastDrawnAt < ms
}

/**
 * The one way the window bodies talk to the host: the live connection sets
 * it, and it drops messages while there is none.
 */
let sender: ((message: object) => void) | null = null

export function setLinuxSender(send: ((message: object) => void) | null): void {
  sender = send
}

export function sendToLinuxApps(message: object): void {
  sender?.(message)
}
