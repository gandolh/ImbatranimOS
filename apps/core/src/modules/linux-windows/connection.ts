import { desktopSessionId, renewDesktopSessionId } from '@imbatranim/ui'
import { TASKBAR_HEIGHT, topVisibleWindowId, useWindowStore } from '../../shared/store/windowStore'
import { LINUX_APP_PREFIX, linuxWindowChrome } from './kind'
import { paintFrame, parseFrame } from './frames'
import {
  canvasFor,
  dropAllCanvases,
  dropCanvas,
  setLinuxSender,
  useLinuxWindowsStore,
  windowForToplevel,
  type Geometry,
  type LinuxToplevel,
} from './linuxWindowsStore'

/** Close codes the backend uses (wayland.constants.ts). */
const CLOSE_REVOKED = 4401
const CLOSE_SESSION_IN_USE = 4409
const CLOSE_UNAVAILABLE = 4503

const RETRY_MAX_MS = 30_000
/** Linux apps can't run on this machine; look again now and then. */
const UNAVAILABLE_RETRY_MS = 5 * 60_000
const VIEWPORT_DEBOUNCE_MS = 250

type ToplevelMessage = {
  type: 'toplevel_created' | 'toplevel_updated'
  toplevel: number
  title: string
  app_id: string
  width: number
  height: number
  geometry: Geometry
  decorations: 'server' | 'client'
  min_width: number
  min_height: number
  max_width: number
  max_height: number
}
type ServerMessage =
  | ToplevelMessage
  | { type: 'toplevel_destroyed'; toplevel: number }
  | { type: 'cursor'; name: string }
  | { type: 'request'; toplevel: number; action: string; edges?: string }
  | { type: 'unavailable'; reason: string }

/** Where Linux apps' windows are drawn: the desktop above the taskbar. */
function viewport(): { width: number; height: number } {
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight - TASKBAR_HEIGHT),
  }
}

/** As the Terminal's socket URL: beside the API, ws or wss to match. */
export function buildWaylandUrl(session: string, size: { width: number; height: number }): string {
  const query = `?session=${encodeURIComponent(session)}&width=${size.width}&height=${size.height}`
  const base = import.meta.env.VITE_API_URL as string | undefined
  if (base) {
    const u = new URL(base, window.location.href)
    const scheme = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${scheme}//${u.host}${u.pathname.replace(/\/+$/, '')}/wayland${query}`
  }
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}/api/wayland${query}`
}

function shape(m: ToplevelMessage): Omit<LinuxToplevel, 'windowId' | 'toplevel'> {
  return {
    title: m.title || m.app_id || 'Linux app',
    appId: m.app_id,
    width: m.width,
    height: m.height,
    geometry: m.geometry,
    decorations: m.decorations,
    min: { width: m.min_width, height: m.min_height },
    max: { width: m.max_width, height: m.max_height },
  }
}

/**
 * This tab's Linux windows socket: opens an OS window for each toplevel the
 * host announces, paints its frames, passes input back, and closes the window
 * when the toplevel goes. One per tab, started once the desktop is signed in.
 *
 * Closing the socket ends the session in the backend and its apps with it,
 * so when it drops, the windows go too; a reconnect starts an empty session.
 */
export class LinuxWindowsConnection {
  private ws: WebSocket | null = null
  private stopped = true
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retries = 0
  private renewedOnce = false
  private viewportTimer: ReturnType<typeof setTimeout> | null = null
  /** One paint at a time per toplevel, so frames land in order. */
  private painting = new Map<number, Promise<void>>()
  private unsubscribeWindows: (() => void) | null = null
  /** The toplevel the host was last told has keyboard focus. */
  private focused: number | null = null

  private readonly onResize = () => {
    if (this.viewportTimer) clearTimeout(this.viewportTimer)
    this.viewportTimer = setTimeout(() => {
      this.send({ type: 'viewport', ...viewport() })
    }, VIEWPORT_DEBOUNCE_MS)
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    window.addEventListener('resize', this.onResize)
    // Keyboard focus follows the window manager's focused window.
    this.unsubscribeWindows = useWindowStore.subscribe(() => this.syncFocus())
    setLinuxSender((m) => this.send(m))
    this.connect()
  }

  stop(): void {
    this.stopped = true
    window.removeEventListener('resize', this.onResize)
    this.unsubscribeWindows?.()
    this.unsubscribeWindows = null
    setLinuxSender(null)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.viewportTimer) clearTimeout(this.viewportTimer)
    const ws = this.ws
    this.ws = null
    ws?.close(1000, 'stopped')
    this.closeAllWindows()
  }

  private connect(): void {
    if (this.stopped) return
    const ws = new WebSocket(buildWaylandUrl(desktopSessionId(), viewport()))
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      this.retries = 0
      this.focused = null
    }
    ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => this.onMessage(ev.data)
    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      this.ws = null
      this.closeAllWindows()
      this.scheduleReconnect(ev.code)
    }
  }

  private scheduleReconnect(code: number): void {
    if (this.stopped) return
    let delay: number
    if (code === CLOSE_SESSION_IN_USE && !this.renewedOnce) {
      // A duplicated tab carries the original's id: take a new one.
      renewDesktopSessionId()
      this.renewedOnce = true
      delay = 0
    } else if (code === CLOSE_UNAVAILABLE) {
      delay = UNAVAILABLE_RETRY_MS
    } else if (code === CLOSE_REVOKED) {
      delay = RETRY_MAX_MS
    } else {
      delay = Math.min(RETRY_MAX_MS, 1000 * 2 ** this.retries)
      this.retries++
    }
    this.retryTimer = setTimeout(() => this.connect(), delay)
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  /** Tell the host which Linux window, if any, the window manager focused. */
  private syncFocus(): void {
    const top = topVisibleWindowId()
    const t = top ? useLinuxWindowsStore.getState().byWindow[top] : undefined
    const next = t ? t.toplevel : null
    if (next === this.focused) return
    this.focused = next
    this.send({ type: 'focus', toplevel: next })
  }

  private onMessage(data: ArrayBuffer | string): void {
    if (typeof data !== 'string') {
      const frame = parseFrame(data)
      if (!frame) return
      if (!windowForToplevel(frame.toplevel)) return
      const canvas = canvasFor(frame.toplevel)
      const prev = this.painting.get(frame.toplevel) ?? Promise.resolve()
      const next = prev.then(() => paintFrame(canvas, frame)).catch(() => undefined)
      this.painting.set(frame.toplevel, next)
      return
    }
    let m: ServerMessage
    try {
      m = JSON.parse(data) as ServerMessage
    } catch {
      return
    }
    if (m.type === 'toplevel_created') this.created(m)
    else if (m.type === 'toplevel_updated') this.updated(m)
    else if (m.type === 'toplevel_destroyed') this.destroyed(m.toplevel)
    else if (m.type === 'cursor') useLinuxWindowsStore.getState().setCursor(m.name)
    else if (m.type === 'request') this.request(m.toplevel, m.action, m.edges)
  }

  private created(m: ToplevelMessage): void {
    if (windowForToplevel(m.toplevel)) {
      this.updated(m)
      return
    }
    const s = shape(m)
    const chrome = linuxWindowChrome(s.decorations === 'server')
    const windows = useWindowStore.getState()
    const windowId = windows.openWindow(
      LINUX_APP_PREFIX + (m.app_id || 'app'),
      s.title,
      { width: s.geometry.width + chrome.width, height: s.geometry.height + chrome.height },
      { width: 120, height: 80 }
    )
    // The close button asks the app; the window closes when its toplevel
    // goes, which may be never (the app asked to save, or refused).
    windows.registerCloseGuard(windowId, () => {
      this.send({ type: 'close', toplevel: m.toplevel })
      return false
    })
    useLinuxWindowsStore.getState().add({ toplevel: m.toplevel, windowId, ...s })
    this.syncFocus()
  }

  private updated(m: ToplevelMessage): void {
    const t = windowForToplevel(m.toplevel)
    if (!t) return
    const s = shape(m)
    if (s.title !== t.title) useWindowStore.getState().updateTitle(t.windowId, s.title)
    useLinuxWindowsStore.getState().update(t.windowId, s)
  }

  private destroyed(toplevel: number): void {
    const t = windowForToplevel(toplevel)
    if (!t) return
    useLinuxWindowsStore.getState().remove(t.windowId)
    this.painting.delete(toplevel)
    dropCanvas(toplevel)
    const windows = useWindowStore.getState()
    windows.unregisterCloseGuard(t.windowId)
    windows.closeWindow(t.windowId)
  }

  /**
   * The app asked the window manager for something. Maximize, restore and
   * minimize map to its own actions (it has no fullscreen, so fullscreen
   * maximizes); a move or resize from the app's own title bar or edge is
   * started by the window body, which knows where the pointer is.
   */
  private request(toplevel: number, action: string, edges?: string): void {
    const t = windowForToplevel(toplevel)
    if (!t) return
    const windows = useWindowStore.getState()
    const win = windows.windows.find((w) => w.id === t.windowId)
    if (!win) return
    switch (action) {
      case 'maximize':
      case 'fullscreen':
        if (!win.isMaximized) windows.maximizeWindow(t.windowId)
        break
      case 'unmaximize':
      case 'unfullscreen':
        if (win.isMaximized) windows.restoreWindow(t.windowId)
        break
      case 'minimize':
        windows.hideWindow(t.windowId)
        break
      case 'move':
      case 'resize':
        useLinuxWindowsStore.getState().setRequest({ windowId: t.windowId, action, edges })
        break
    }
  }

  private closeAllWindows(): void {
    const all = Object.values(useLinuxWindowsStore.getState().byWindow)
    useLinuxWindowsStore.getState().clear()
    this.painting.clear()
    this.focused = null
    dropAllCanvases()
    const windows = useWindowStore.getState()
    for (const t of all) {
      windows.unregisterCloseGuard(t.windowId)
      windows.closeWindow(t.windowId)
    }
  }
}
