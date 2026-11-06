import { useEffect, useRef } from 'react'
import {
  TASKBAR_HEIGHT,
  TITLEBAR_MIN_VISIBLE,
  useWindowStore,
} from '../../shared/store/windowStore'
import { isPasteKey, linuxKeys } from './clipboard'
import { isDesktopShortcut } from './desktopKeys'
import { linuxWindowChrome } from './kind'
import { evdevCode } from './keymap'
import { canvasFor, sendToLinuxApps, useLinuxWindowsStore } from './linuxWindowsStore'
import { attachPointer } from './pointerInput'

/** A resize sends at most one configure this often while the edge is dragged. */
const CONFIGURE_THROTTLE_MS = 50

type Grab =
  | { kind: 'move'; x: number; y: number; posX: number; posY: number }
  | {
      kind: 'resize'
      edges: string
      x: number
      y: number
      posX: number
      posY: number
      width: number
      height: number
    }

/**
 * The inside of a Linux window: the toplevel's canvas, one surface coordinate
 * to one CSS pixel (`scale` image pixels to each, see `paintFrame`), shifted
 * so the app's window geometry starts at the top-left and its shadows fall
 * outside. It passes the
 * pointer and keyboard to the app, tells the app its new size when the OS
 * window is resized, and runs the drags an app starts from its own title bar.
 */
export function LinuxWindowBody({ windowId }: { windowId: string }) {
  const toplevel = useLinuxWindowsStore((s) => s.byWindow[windowId]?.toplevel)
  const gx = useLinuxWindowsStore((s) => s.byWindow[windowId]?.geometry.x ?? 0)
  const gy = useLinuxWindowsStore((s) => s.byWindow[windowId]?.geometry.y ?? 0)
  const cursor = useLinuxWindowsStore((s) => s.cursor)
  const request = useLinuxWindowsStore((s) => s.request)
  const isMaximized = useWindowStore(
    (s) => s.windows.find((w) => w.id === windowId)?.isMaximized ?? false
  )
  const holder = useRef<HTMLDivElement>(null)
  const pointer = useRef({ down: false, x: 0, y: 0, grab: null as Grab | null })
  const sent = useRef({ width: 0, height: 0, maximized: false })

  // The canvas, moved into this window and offset by the geometry.
  useEffect(() => {
    const el = holder.current
    if (!el || toplevel === undefined) return
    const canvas = canvasFor(toplevel)
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    el.appendChild(canvas)
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas)
    }
  }, [toplevel])

  useEffect(() => {
    if (toplevel === undefined) return
    canvasFor(toplevel).style.transform = `translate(${-gx}px, ${-gy}px)`
  }, [toplevel, gx, gy])

  // Pointer and keyboard.
  useEffect(() => {
    const el = holder.current
    if (!el || toplevel === undefined) return
    const pressedKeys = new Set<number>()
    const detachPointer = attachPointer(el, toplevel, () => canvasFor(toplevel), {
      onDown: () => {
        el.focus({ preventScroll: true })
        pointer.current.down = true
      },
      onMove: (e) => {
        const p = pointer.current
        p.x = e.clientX
        p.y = e.clientY
        if (!p.grab) return false
        runGrab(windowId, p.grab, e.clientX, e.clientY)
        return true
      },
      onUp: () => {
        pointer.current.down = false
        pointer.current.grab = null
      },
    })
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isDesktopShortcut(e)) return
      const code = evdevCode(e.code)
      if (code === undefined) return
      e.preventDefault()
      e.stopPropagation()
      // The app repeats keys itself (wl_keyboard.repeat_info).
      if (e.repeat || pressedKeys.has(code)) return
      pressedKeys.add(code)
      const press = { type: 'key', keycode: code, pressed: true }
      // A paste key brings the clipboard's text over before the app sees it.
      if (isPasteKey(e)) linuxKeys.paste(press)
      else linuxKeys.key(press)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const code = evdevCode(e.code)
      if (code === undefined || !pressedKeys.has(code)) return
      e.preventDefault()
      e.stopPropagation()
      pressedKeys.delete(code)
      linuxKeys.key({ type: 'key', keycode: code, pressed: false })
    }
    // Keys held when the keyboard leaves would stay down in the app.
    const onBlur = () => {
      for (const code of pressedKeys) linuxKeys.key({ type: 'key', keycode: code, pressed: false })
      pressedKeys.clear()
    }

    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('keyup', onKeyUp)
    el.addEventListener('blur', onBlur)
    return () => {
      onBlur()
      detachPointer()
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('blur', onBlur)
    }
  }, [toplevel, windowId])

  // Where the app's window starts on the output, for the host to keep its
  // popups on screen. Read from the page after the window manager moves,
  // resizes or maximizes the OS window.
  useEffect(() => {
    const el = holder.current
    if (!el || toplevel === undefined) return
    let last = ''
    let frame = 0
    const report = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      const x = Math.round(r.left)
      const y = Math.round(r.top)
      const key = `${x},${y}`
      if (key === last) return
      last = key
      sendToLinuxApps({ type: 'position', toplevel, x, y })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }
    const unsubscribe = useWindowStore.subscribe(schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    schedule()
    return () => {
      unsubscribe()
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [toplevel])

  // The OS window's size is the app's window size: tell it on every change.
  useEffect(() => {
    const el = holder.current
    if (!el || toplevel === undefined) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      const width = Math.round(el.clientWidth)
      const height = Math.round(el.clientHeight)
      const t = useLinuxWindowsStore.getState().byWindow[windowId]
      if (!t || width < 1 || height < 1) return
      const last = sent.current
      const same =
        width === (last.width || t.geometry.width) &&
        height === (last.height || t.geometry.height) &&
        isMaximized === last.maximized
      if (same) return
      sent.current = { width, height, maximized: isMaximized }
      sendToLinuxApps({ type: 'configure', toplevel, width, height, maximized: isMaximized })
    }
    const observer = new ResizeObserver(() => {
      if (!timer) timer = setTimeout(flush, CONFIGURE_THROTTLE_MS)
    })
    observer.observe(el)
    flush()
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [toplevel, windowId, isMaximized])

  // A move or resize the app asked for, from where the pointer is now.
  useEffect(() => {
    if (!request || request.windowId !== windowId || !pointer.current.down) return
    const win = useWindowStore.getState().windows.find((w) => w.id === windowId)
    if (!win || win.isMaximized) return
    const { x, y } = pointer.current
    pointer.current.grab =
      request.action === 'move'
        ? { kind: 'move', x, y, posX: win.position.x, posY: win.position.y }
        : {
            kind: 'resize',
            edges: request.edges ?? 'se',
            x,
            y,
            posX: win.position.x,
            posY: win.position.y,
            width: win.size.width,
            height: win.size.height,
          }
    useWindowStore.getState().focusWindow(windowId)
  }, [request, windowId])

  // No accent focus ring here, on purpose (owner, 2026-11-03): this surface is
  // the Linux app's own, and the app draws its own focus inside its frames.
  // A ring would sit over the app's pixels. The title bar's controls keep theirs.
  return (
    <div
      ref={holder}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden bg-black outline-none"
      style={{ cursor, touchAction: 'none' }}
      data-linux-window=""
      data-linux-toplevel-id={toplevel}
      aria-label="Linux app window"
    />
  )
}

/** One step of an app-started drag, with the window manager's own limits. */
function runGrab(windowId: string, grab: Grab, px: number, py: number): void {
  const store = useWindowStore.getState()
  const win = store.windows.find((w) => w.id === windowId)
  if (!win) return
  const mx = px - grab.x
  const my = py - grab.y
  if (grab.kind === 'move') {
    const x = Math.max(0, Math.min(grab.posX + mx, window.innerWidth - win.size.width))
    const y = Math.max(
      0,
      Math.min(grab.posY + my, window.innerHeight - TASKBAR_HEIGHT - TITLEBAR_MIN_VISIBLE)
    )
    store.updatePosition(windowId, { x, y })
    return
  }
  const t = useLinuxWindowsStore.getState().byWindow[windowId]
  const chrome = linuxWindowChrome(t?.decorations === 'server')
  const minW = Math.max(120, (t?.min.width ?? 0) + chrome.width)
  const minH = Math.max(80, (t?.min.height ?? 0) + chrome.height)
  let { posX: x, posY: y, width, height } = grab
  if (grab.edges.includes('e')) {
    width = Math.max(minW, Math.min(window.innerWidth - grab.posX, grab.width + mx))
  }
  if (grab.edges.includes('s')) {
    height = Math.max(
      minH,
      Math.min(window.innerHeight - TASKBAR_HEIGHT - grab.posY, grab.height + my)
    )
  }
  if (grab.edges.includes('w')) {
    const d = Math.min(mx, grab.width - minW)
    width = grab.width - d
    x = grab.posX + d
  }
  if (grab.edges.includes('n')) {
    const d = Math.max(Math.min(my, grab.height - minH), -grab.posY)
    height = grab.height - d
    y = grab.posY + d
  }
  store.updateSize(windowId, { width, height })
  store.updatePosition(windowId, { x, y })
}
