import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type SnapRegion = 'left' | 'right' | 'top' | 'tl' | 'tr' | 'bl' | 'br'

export type WindowInstance = {
  id: string
  appId: string
  title: string
  isVisible: boolean
  isMaximized: boolean
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  snapState?: SnapRegion
}

type PreMaximizeState = {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

// Windows-7-classic layout: chrome lives in a BOTTOM taskbar, so the usable
// desktop starts at y=0 and is bounded below by the taskbar. TOPBAR_HEIGHT is
// kept (=0) for the handful of call sites that still import it.
export const TOPBAR_HEIGHT = 0
export const TASKBAR_HEIGHT = 44

// ── Layout persistence ────────────────────────────────────────────────────────

export type PersistedWindow = {
  appId: string
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  isMaximized: boolean
  isVisible: boolean
  zIndex: number
  snapState?: SnapRegion
}

const LAYOUT_STORAGE_KEY = 'imbatranimos:window-layout'

export function saveLayout(windows: WindowInstance[]): void {
  const data: PersistedWindow[] = windows.map((w) => ({
    appId: w.appId,
    title: w.title,
    position: w.position,
    size: w.size,
    isMaximized: w.isMaximized,
    isVisible: w.isVisible,
    zIndex: w.zIndex,
    snapState: w.snapState,
  }))
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded or private mode — silently skip
  }
}

export function loadLayout(): PersistedWindow[] {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PersistedWindow[]
  } catch {
    return []
  }
}

export function clearLayout(): void {
  localStorage.removeItem(LAYOUT_STORAGE_KEY)
}

// ── Snap geometry helpers ─────────────────────────────────────────────────────

export function computeSnapGeometry(region: SnapRegion): {
  position: { x: number; y: number }
  size: { width: number; height: number }
} {
  const W = window.innerWidth
  const H = window.innerHeight - TASKBAR_HEIGHT
  const halfW = Math.floor(W / 2)
  const halfH = Math.floor(H / 2)
  const top = 0

  switch (region) {
    case 'left':
      return { position: { x: 0, y: top }, size: { width: halfW, height: H } }
    case 'right':
      return { position: { x: halfW, y: top }, size: { width: W - halfW, height: H } }
    case 'top':
      return { position: { x: 0, y: top }, size: { width: W, height: H } }
    case 'tl':
      return { position: { x: 0, y: top }, size: { width: halfW, height: halfH } }
    case 'tr':
      return { position: { x: halfW, y: top }, size: { width: W - halfW, height: halfH } }
    case 'bl':
      return { position: { x: 0, y: top + halfH }, size: { width: halfW, height: H - halfH } }
    case 'br':
      return {
        position: { x: halfW, y: top + halfH },
        size: { width: W - halfW, height: H - halfH },
      }
  }
}

// ── Detect snap region from pointer position ──────────────────────────────────

const EDGE_THRESHOLD = 32 // px from edge to trigger snap

export function detectSnapRegion(pointerX: number, pointerY: number): SnapRegion | null {
  const W = window.innerWidth
  const H = window.innerHeight
  const nearLeft = pointerX <= EDGE_THRESHOLD
  const nearRight = pointerX >= W - EDGE_THRESHOLD
  const nearTop = pointerY <= EDGE_THRESHOLD
  const nearBottom = pointerY >= H - TASKBAR_HEIGHT - EDGE_THRESHOLD

  if (nearTop && nearLeft) return 'tl'
  if (nearTop && nearRight) return 'tr'
  if (nearBottom && nearLeft) return 'bl'
  if (nearBottom && nearRight) return 'br'
  if (nearTop) return 'top'
  if (nearLeft) return 'left'
  if (nearRight) return 'right'
  return null
}

// ── Store ─────────────────────────────────────────────────────────────────────

type WindowStore = {
  windows: WindowInstance[]
  preMaximizeStates: Record<string, PreMaximizeState>
  preSnapStates: Record<string, PreMaximizeState>
  nextZIndex: number

  openWindow: (
    appId: string,
    title: string,
    defaultSize: { width: number; height: number },
    minSize: { width: number; height: number },
    initialPosition?: { x: number; y: number }
  ) => string
  closeWindow: (id: string) => void
  hideWindow: (id: string) => void
  showWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  focusWindow: (id: string) => void
  updatePosition: (id: string, position: { x: number; y: number }) => void
  updateSize: (id: string, size: { width: number; height: number }) => void
  getOrderedWindows: () => WindowInstance[]
  snapWindow: (id: string, region: SnapRegion) => void
  unsnap: (id: string) => void
  persistLayout: () => void
  restoreLayout: () => void
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  preMaximizeStates: {},
  preSnapStates: {},
  nextZIndex: 1,

  openWindow: (appId, title, defaultSize, minSize, initialPosition) => {
    const id = uuidv4()
    const { nextZIndex } = get()

    let x: number
    let y: number

    const maxY = window.innerHeight - TASKBAR_HEIGHT - minSize.height

    if (initialPosition) {
      x = Math.max(0, Math.min(initialPosition.x, window.innerWidth - minSize.width))
      y = Math.max(0, Math.min(initialPosition.y, maxY))
    } else {
      const centerX = Math.floor((window.innerWidth - defaultSize.width) / 2)
      const centerY = Math.floor((window.innerHeight - TASKBAR_HEIGHT - defaultSize.height) / 2)

      const offsetX = Math.floor(Math.random() * 201) - 100
      const offsetY = Math.floor(Math.random() * 201) - 100

      x = Math.max(0, Math.min(centerX + offsetX, window.innerWidth - minSize.width))
      y = Math.max(0, Math.min(centerY + offsetY, maxY))
    }

    const instance: WindowInstance = {
      id,
      appId,
      title,
      isVisible: true,
      isMaximized: false,
      position: { x, y },
      size: { width: defaultSize.width, height: defaultSize.height },
      zIndex: nextZIndex,
    }

    set((state) => ({
      windows: [...state.windows, instance],
      nextZIndex: state.nextZIndex + 1,
    }))

    return id
  },

  closeWindow: (id) => {
    set((state) => {
      const { [id]: _removedPre, ...remainingPreMax } = state.preMaximizeStates
      const { [id]: _removedSnap, ...remainingPreSnap } = state.preSnapStates
      return {
        windows: state.windows.filter((w) => w.id !== id),
        preMaximizeStates: remainingPreMax,
        preSnapStates: remainingPreSnap,
      }
    })
  },

  hideWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, isVisible: false } : w)),
    }))
  },

  showWindow: (id) => {
    const { nextZIndex } = get()
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, isVisible: true, zIndex: nextZIndex } : w
      ),
      nextZIndex: state.nextZIndex + 1,
    }))
  },

  maximizeWindow: (id) => {
    set((state) => {
      const win = state.windows.find((w) => w.id === id)
      if (!win) return state

      const preMaximizeStates = {
        ...state.preMaximizeStates,
        [id]: { position: win.position, size: win.size },
      }

      return {
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                isMaximized: true,
                snapState: undefined,
                position: { x: 0, y: 0 },
                size: {
                  width: window.innerWidth,
                  height: window.innerHeight - TASKBAR_HEIGHT,
                },
              }
            : w
        ),
        preMaximizeStates,
      }
    })
  },

  restoreWindow: (id) => {
    set((state) => {
      const saved = state.preMaximizeStates[id]
      if (!saved) return state

      const { [id]: _removed, ...remainingPreMax } = state.preMaximizeStates

      return {
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                isMaximized: false,
                snapState: undefined,
                position: saved.position,
                size: saved.size,
              }
            : w
        ),
        preMaximizeStates: remainingPreMax,
      }
    })
  },

  focusWindow: (id) => {
    const { nextZIndex } = get()
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, zIndex: nextZIndex } : w)),
      nextZIndex: state.nextZIndex + 1,
    }))
  },

  updatePosition: (id, position) => {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, position } : w)),
    }))
  },

  updateSize: (id, size) => {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, size } : w)),
    }))
  },

  getOrderedWindows: () => {
    return [...get().windows].sort((a, b) => a.zIndex - b.zIndex)
  },

  snapWindow: (id, region) => {
    set((state) => {
      const win = state.windows.find((w) => w.id === id)
      if (!win) return state

      // Save pre-snap state only if not already snapped
      const preSnapStates = win.snapState
        ? state.preSnapStates
        : {
            ...state.preSnapStates,
            [id]: { position: win.position, size: win.size },
          }

      const { position, size } = computeSnapGeometry(region)

      return {
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                snapState: region,
                isMaximized: false,
                position,
                size,
              }
            : w
        ),
        preSnapStates,
      }
    })
  },

  unsnap: (id) => {
    set((state) => {
      const saved = state.preSnapStates[id]
      const win = state.windows.find((w) => w.id === id)
      if (!win || !saved) {
        // Just clear snapState
        return {
          windows: state.windows.map((w) => (w.id === id ? { ...w, snapState: undefined } : w)),
        }
      }

      const { [id]: _removed, ...remainingPreSnap } = state.preSnapStates

      return {
        windows: state.windows.map((w) =>
          w.id === id
            ? {
                ...w,
                snapState: undefined,
                position: saved.position,
                size: saved.size,
              }
            : w
        ),
        preSnapStates: remainingPreSnap,
      }
    })
  },

  persistLayout: () => {
    const { windows } = get()
    saveLayout(windows)
  },

  restoreLayout: () => {
    const persisted = loadLayout()
    if (persisted.length === 0) return

    const maxZ = persisted.reduce((acc, w) => Math.max(acc, w.zIndex), 0)

    const windows: WindowInstance[] = persisted.map((p) => ({
      id: uuidv4(), // regenerate — do NOT persist uuid
      appId: p.appId,
      title: p.title,
      position: p.position,
      size: p.size,
      isMaximized: p.isMaximized,
      isVisible: p.isVisible,
      zIndex: p.zIndex,
      snapState: p.snapState,
    }))

    set({
      windows,
      nextZIndex: maxZ + 1,
      preMaximizeStates: {},
      preSnapStates: {},
    })
  },
}))
