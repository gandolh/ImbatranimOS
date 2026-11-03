// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinuxWindowsConnection } from './connection'
import { useLinuxWindowsStore } from './linuxWindowsStore'
import { useWindowStore, type WindowInstance } from '../../shared/store/windowStore'

/**
 * Linux windows keep their places after a reload: a window the session still
 * runs comes back where it was (position, size, maximized, workspace); one
 * whose app stopped opens nothing, and an app started after the reload opens
 * where a new window does.
 *
 * The real connection, window store and session storage; the socket is a
 * fake that the test speaks the backend's side of.
 */

class FakeSocket {
  static last: FakeSocket | null = null
  static OPEN = 1
  readyState = 1
  binaryType = 'arraybuffer'
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  constructor(public url: string) {
    FakeSocket.last = this
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {}
  /** The backend's side: one message to the tab. */
  say(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const GEOMETRY = { x: 0, y: 0, width: 600, height: 400 }
const created = (toplevel: number, app = 'foot') => ({
  type: 'toplevel_created',
  toplevel,
  title: app,
  app_id: app,
  width: 600,
  height: 400,
  geometry: GEOMETRY,
  decorations: 'server',
  min_width: 0,
  min_height: 0,
  max_width: 0,
  max_height: 0,
})

let connection: LinuxWindowsConnection

/** A tab: the desktop restores its layout, then the socket connects. */
function openTab(): FakeSocket {
  useWindowStore.getState().restoreLayout()
  connection = new LinuxWindowsConnection()
  connection.start()
  const ws = FakeSocket.last!
  ws.onopen?.()
  return ws
}

/** A reload: the layout is saved as the page goes, and this tab's state is gone. */
function reload(): FakeSocket {
  useWindowStore.getState().persistLayout()
  connection.stop()
  useWindowStore.setState({ windows: [], nextZIndex: 1, activeWorkspace: 1 })
  useLinuxWindowsStore.getState().clear()
  return openTab()
}

const linuxWindows = (): WindowInstance[] =>
  useWindowStore.getState().windows.filter((w) => w.appId.startsWith('linux:'))

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  sessionStorage.clear()
  window.innerWidth = 1600
  window.innerHeight = 1000
  useWindowStore.setState({ windows: [], nextZIndex: 1, activeWorkspace: 1 })
  useLinuxWindowsStore.getState().clear()
})

afterEach(() => {
  connection?.stop()
  vi.unstubAllGlobals()
})

describe('Linux windows after a reload', () => {
  it('come back where they were while their app still runs', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(5))
    const [win] = linuxWindows()
    const store = useWindowStore.getState()
    store.updatePosition(win.id, { x: 410, y: 120 })
    store.updateSize(win.id, { width: 820, height: 530 })
    store.moveWindowToWorkspace(win.id, 3)

    const again = reload()
    // Nothing opens from the layout itself: the session announces its windows.
    expect(linuxWindows()).toEqual([])
    again.say({ type: 'session', resumed: true })
    again.say(created(5))
    again.say({ type: 'cursor', name: 'default' })

    const [back] = linuxWindows()
    expect(back.position).toEqual({ x: 410, y: 120 })
    expect(back.size).toEqual({ width: 820, height: 530 })
    expect(back.workspaceId).toBe(3)
    expect(back.isMaximized).toBe(false)
  })

  it('come back maximized when they were', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(2, 'firefox'))
    const [win] = linuxWindows()
    useWindowStore.getState().maximizeWindow(win.id)

    const again = reload()
    again.say({ type: 'session', resumed: true })
    again.say(created(2, 'firefox'))
    expect(linuxWindows()[0].isMaximized).toBe(true)
  })

  it('keep their places across two reloads in a row', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(5))
    useWindowStore.getState().updatePosition(linuxWindows()[0].id, { x: 300, y: 200 })
    // Reloaded twice before the session answered the first time.
    reload()
    const third = reload()
    third.say({ type: 'session', resumed: true })
    third.say(created(5))
    expect(linuxWindows()[0].position).toEqual({ x: 300, y: 200 })
  })

  it('open nothing for an app that stopped, and drop its place', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(5))
    useWindowStore.getState().updatePosition(linuxWindows()[0].id, { x: 410, y: 120 })

    // The app exited while the page reloaded: the resync announces nothing.
    const again = reload()
    again.say({ type: 'session', resumed: true })
    again.say({ type: 'cursor', name: 'default' })
    expect(linuxWindows()).toEqual([])

    // An app started after the reload opens where a new window opens.
    again.say(created(6))
    expect(linuxWindows()[0].position).not.toEqual({ x: 410, y: 120 })
    useWindowStore.getState().persistLayout()
    const saved = JSON.parse(sessionStorage.getItem('imbatranimos:window-layout')!) as {
      linux?: { toplevel: number }
    }[]
    expect(saved.map((p) => p.linux?.toplevel)).toEqual([6])
  })

  it('give a new session no old places, even under the same ids', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(1))
    useWindowStore.getState().updatePosition(linuxWindows()[0].id, { x: 410, y: 120 })

    // Past the grace period the backend starts a new session; its first
    // window is toplevel 1 again, but it isn't the old one.
    const again = reload()
    again.say({ type: 'session', resumed: false })
    again.say(created(1))
    expect(linuxWindows()[0].position).not.toEqual({ x: 410, y: 120 })
  })

  it('come back where they were after the socket drops and reconnects', () => {
    const ws = openTab()
    ws.say({ type: 'session', resumed: false })
    ws.say(created(5))
    useWindowStore.getState().updatePosition(linuxWindows()[0].id, { x: 250, y: 90 })

    vi.useFakeTimers()
    ws.onclose?.({ code: 1006 })
    expect(linuxWindows()).toEqual([])
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    const again = FakeSocket.last!
    expect(again).not.toBe(ws)
    again.onopen?.()
    again.say({ type: 'session', resumed: true })
    again.say(created(5))
    expect(linuxWindows()[0].position).toEqual({ x: 250, y: 90 })
  })
})
