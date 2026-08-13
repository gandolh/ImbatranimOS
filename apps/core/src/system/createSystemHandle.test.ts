import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemHandle } from './createSystemHandle'
import { useWindowStore } from '../shared/store/windowStore'
import { useIntentStore } from '../shared/store/intentStore'

const SIZE = { width: 400, height: 300 }
const MIN = { width: 200, height: 150 }

// windowStore geometry reads window.innerWidth/innerHeight; markDirty's guard
// reads window.confirm. Stub a minimal window for the Node test environment.
let confirmResult = true

beforeEach(() => {
  confirmResult = true
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 800,
    confirm: () => confirmResult,
  })
  useWindowStore.setState({
    windows: [],
    preMaximizeStates: {},
    preSnapStates: {},
    closeGuards: {},
    nextZIndex: 1,
  })
  useIntentStore.setState({ intents: new Map() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Open two windows; return their ids in open order (b is on top). */
function openTwo(): { a: string; b: string } {
  const store = useWindowStore.getState()
  const a = store.openWindow('app-a', 'A', SIZE, MIN)
  const b = store.openWindow('app-b', 'B', SIZE, MIN)
  return { a, b }
}

const find = (id: string) => useWindowStore.getState().windows.find((w) => w.id === id)

describe('createSystemHandle — window scoping', () => {
  it('targets only its own window for setTitle / resize / minimize / focus', () => {
    const { a, b } = openTwo()
    const system = createSystemHandle(a)

    system.window.setTitle('Renamed')
    expect(find(a)?.title).toBe('Renamed')
    expect(find(b)?.title).toBe('B')

    system.window.resize(640, 480)
    expect(find(a)?.size).toEqual({ width: 640, height: 480 })
    expect(find(b)?.size).toEqual(SIZE)

    system.window.minimize()
    expect(find(a)?.isVisible).toBe(false)
    expect(find(b)?.isVisible).toBe(true)

    system.window.focus()
    const top = Math.max(...useWindowStore.getState().windows.map((w) => w.zIndex))
    expect(find(a)?.zIndex).toBe(top)
  })

  it('requestClose closes only its own window', () => {
    const { a, b } = openTwo()
    createSystemHandle(a).window.requestClose()
    expect(find(a)).toBeUndefined()
    expect(find(b)).toBeDefined()
  })

  it('markDirty scopes the unsaved-changes close guard to its own window', () => {
    const { a, b } = openTwo()
    const system = createSystemHandle(a)

    system.window.markDirty(true)
    confirmResult = false
    // A dirty window vetoes its own close via the confirm...
    useWindowStore.getState().closeWindow(a)
    expect(find(a)).toBeDefined()
    // ...but never blocks a different window.
    useWindowStore.getState().closeWindow(b)
    expect(find(b)).toBeUndefined()

    // Clearing dirty removes the guard.
    system.window.markDirty(false)
    useWindowStore.getState().closeWindow(a)
    expect(find(a)).toBeUndefined()
  })
})

describe('createSystemHandle — on(event) lifecycle', () => {
  it('focus: seeds only when active, fires on becoming active, stops after unsubscribe', () => {
    const { a } = openTwo() // b is on top, so a is NOT active
    const system = createSystemHandle(a)

    const cb = vi.fn()
    const off = system.on('focus', cb)
    expect(cb).not.toHaveBeenCalled() // a is not active at subscribe time

    useWindowStore.getState().focusWindow(a) // a becomes active
    expect(cb).toHaveBeenCalledTimes(1)

    off()
    useWindowStore.getState().focusWindow(useWindowStore.getState().windows[1]!.id)
    useWindowStore.getState().focusWindow(a)
    expect(cb).toHaveBeenCalledTimes(1) // no further calls after unsubscribe
  })

  it('blur: seeds immediately when already inactive', () => {
    const { a } = openTwo()
    const cb = vi.fn()
    createSystemHandle(a).on('blur', cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('visibilitychange: fires on minimize/restore, not on subscribe', () => {
    const { a } = openTwo()
    const cb = vi.fn()
    const off = createSystemHandle(a).on('visibilitychange', cb)
    expect(cb).not.toHaveBeenCalled()

    useWindowStore.getState().hideWindow(a)
    expect(cb).toHaveBeenCalledTimes(1)
    useWindowStore.getState().showWindow(a)
    expect(cb).toHaveBeenCalledTimes(2)

    off()
    useWindowStore.getState().hideWindow(a)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('close-request: subscription is a no-op stub that unsubscribes cleanly', () => {
    const { a } = openTwo()
    const cb = vi.fn()
    const off = createSystemHandle(a).on('close-request', cb)
    useWindowStore.getState().closeWindow(a)
    expect(cb).not.toHaveBeenCalled()
    expect(() => off()).not.toThrow()
  })
})

describe('createSystemHandle — intents.onOpen', () => {
  it('delivers the pending launch payload then later re-deliveries', () => {
    const { a } = openTwo()
    useIntentStore.getState().setIntent(a, { openPath: 'first' })

    const system = createSystemHandle(a)
    const handler = vi.fn()
    const off = system.intents.onOpen(handler)

    expect(handler).toHaveBeenCalledWith({ openPath: 'first' })

    useIntentStore.getState().setIntent(a, { openPath: 'second' })
    expect(handler).toHaveBeenCalledWith({ openPath: 'second' })
    expect(handler).toHaveBeenCalledTimes(2)

    off()
    useIntentStore.getState().setIntent(a, { openPath: 'third' })
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
