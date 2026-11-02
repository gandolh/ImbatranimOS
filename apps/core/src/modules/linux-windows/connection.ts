import { desktopSessionId, renewDesktopSessionId } from '@imbatranim/ui'
import { TASKBAR_HEIGHT, useWindowStore } from '../../shared/store/windowStore'
import { LINUX_APP_PREFIX, LINUX_WINDOW_CHROME } from './kind'
import { paintFrame, parseFrame } from './frames'
import {
  canvasFor,
  dropAllCanvases,
  dropCanvas,
  useLinuxWindowsStore,
  windowForToplevel,
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
}
type ServerMessage =
  | ToplevelMessage
  | { type: 'toplevel_destroyed'; toplevel: number }
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

/**
 * This tab's Linux windows socket: opens an OS window for each toplevel the
 * host announces, paints its frames, closes it when the toplevel goes. One
 * per tab, started once the desktop is signed in.
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
    this.connect()
  }

  stop(): void {
    this.stopped = true
    window.removeEventListener('resize', this.onResize)
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

  private onMessage(data: ArrayBuffer | string): void {
    if (typeof data !== 'string') {
      const frame = parseFrame(data)
      if (!frame) return
      const t = windowForToplevel(frame.toplevel)
      if (!t) return
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
  }

  private created(m: ToplevelMessage): void {
    if (windowForToplevel(m.toplevel)) {
      this.updated(m)
      return
    }
    const appId = LINUX_APP_PREFIX + (m.app_id || 'app')
    const title = m.title || m.app_id || 'Linux app'
    const windowId = useWindowStore.getState().openWindow(
      appId,
      title,
      {
        width: m.width + LINUX_WINDOW_CHROME.width,
        height: m.height + LINUX_WINDOW_CHROME.height,
      },
      { width: 120, height: 80 }
    )
    useLinuxWindowsStore.getState().add({
      toplevel: m.toplevel,
      windowId,
      title,
      appId: m.app_id,
      width: m.width,
      height: m.height,
    })
  }

  private updated(m: ToplevelMessage): void {
    const t = windowForToplevel(m.toplevel)
    if (!t) return
    const title = m.title || m.app_id || 'Linux app'
    const windows = useWindowStore.getState()
    if (title !== t.title) windows.updateTitle(t.windowId, title)
    // The app chose a new size: the OS window follows its picture.
    if (m.width !== t.width || m.height !== t.height) {
      windows.updateSize(t.windowId, {
        width: m.width + LINUX_WINDOW_CHROME.width,
        height: m.height + LINUX_WINDOW_CHROME.height,
      })
    }
    useLinuxWindowsStore
      .getState()
      .update(t.windowId, { title, appId: m.app_id, width: m.width, height: m.height })
  }

  private destroyed(toplevel: number): void {
    const t = windowForToplevel(toplevel)
    if (!t) return
    useLinuxWindowsStore.getState().remove(t.windowId)
    this.painting.delete(toplevel)
    dropCanvas(toplevel)
    useWindowStore.getState().closeWindow(t.windowId)
  }

  private closeAllWindows(): void {
    const all = Object.values(useLinuxWindowsStore.getState().byWindow)
    useLinuxWindowsStore.getState().clear()
    this.painting.clear()
    dropAllCanvases()
    const windows = useWindowStore.getState()
    for (const t of all) windows.closeWindow(t.windowId)
  }
}
