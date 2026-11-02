import { useEffect, useRef } from 'react'
import {
  TASKBAR_HEIGHT,
  TITLEBAR_MIN_VISIBLE,
  useWindowStore,
} from '../../shared/store/windowStore'
import { isDesktopShortcut } from './desktopKeys'
import { linuxWindowChrome } from './kind'
import { evdevButton, evdevCode } from './keymap'
import { canvasFor, sendToLinuxApps, useLinuxWindowsStore } from './linuxWindowsStore'

/** A resize sends at most one configure this often while the edge is dragged. */
const CONFIGURE_THROTTLE_MS = 50
/** Wayland's scroll value for one wheel notch (libinput's 15 degrees). */
const WHEEL_NOTCH_VALUE = 15

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
 * The inside of a Linux window: the toplevel's canvas, one image pixel to one
 * CSS pixel (the session's output has scale 1), shifted so the app's window
 * geometry starts at the top-left and its shadows fall outside. It passes the
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
    const send = (m: object) => sendToLinuxApps(m)
    const surfacePoint = (e: MouseEvent) => {
      const r = canvasFor(toplevel).getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onPointerMove = (e: PointerEvent) => {
      const p = pointer.current
      p.x = e.clientX
      p.y = e.clientY
      if (p.grab) {
        runGrab(windowId, p.grab, e.clientX, e.clientY)
        return
      }
      send({ type: 'pointer_motion', toplevel, ...surfacePoint(e) })
    }
    const onPointerDown = (e: PointerEvent) => {
      const button = evdevButton(e.button)
      if (button === undefined) return
      el.focus({ preventScroll: true })
      el.setPointerCapture(e.pointerId)
      pointer.current.down = true
      send({ type: 'pointer_motion', toplevel, ...surfacePoint(e) })
      send({ type: 'pointer_button', toplevel, button, pressed: true })
    }
    const onPointerUp = (e: PointerEvent) => {
      const button = evdevButton(e.button)
      const p = pointer.current
      p.down = false
      p.grab = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (button !== undefined) send({ type: 'pointer_button', toplevel, button, pressed: false })
    }
    const onPointerLeave = () => {
      if (!pointer.current.down) send({ type: 'pointer_leave' })
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const legacy = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }
      const notches = (d: number | undefined) => d !== undefined && d !== 0 && d % 120 === 0
      let dx: number, dy: number, v120x: number, v120y: number, wheel: boolean
      if (
        e.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (notches(legacy.wheelDeltaY) || notches(legacy.wheelDeltaX))
      ) {
        // A mouse wheel: whole notches of 120.
        v120x = -(legacy.wheelDeltaX ?? 0)
        v120y = -(legacy.wheelDeltaY ?? 0)
        dx = (v120x / 120) * WHEEL_NOTCH_VALUE
        dy = (v120y / 120) * WHEEL_NOTCH_VALUE
        wheel = true
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        // Lines, three to a notch.
        v120x = Math.round(e.deltaX * 40)
        v120y = Math.round(e.deltaY * 40)
        dx = e.deltaX * (WHEEL_NOTCH_VALUE / 3)
        dy = e.deltaY * (WHEEL_NOTCH_VALUE / 3)
        wheel = true
      } else {
        // A touchpad: smooth pixels.
        v120x = 0
        v120y = 0
        dx = e.deltaX
        dy = e.deltaY
        wheel = false
      }
      send({ type: 'pointer_axis', toplevel, dx, dy, v120x, v120y, wheel })
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isDesktopShortcut(e)) return
      const code = evdevCode(e.code)
      if (code === undefined) return
      e.preventDefault()
      e.stopPropagation()
      // The app repeats keys itself (wl_keyboard.repeat_info).
      if (e.repeat || pressedKeys.has(code)) return
      pressedKeys.add(code)
      send({ type: 'key', keycode: code, pressed: true })
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const code = evdevCode(e.code)
      if (code === undefined || !pressedKeys.has(code)) return
      e.preventDefault()
      e.stopPropagation()
      pressedKeys.delete(code)
      send({ type: 'key', keycode: code, pressed: false })
    }
    // Keys held when the keyboard leaves would stay down in the app.
    const onBlur = () => {
      for (const code of pressedKeys) send({ type: 'key', keycode: code, pressed: false })
      pressedKeys.clear()
    }

    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('keyup', onKeyUp)
    el.addEventListener('blur', onBlur)
    return () => {
      onBlur()
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('blur', onBlur)
    }
  }, [toplevel, windowId])

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

  return (
    <div
      ref={holder}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden bg-black outline-none"
      style={{ cursor, touchAction: 'none' }}
      data-linux-window=""
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
