// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemProvider, type SystemHandle } from '@imbatranim/ui'
import { createSystemHandle } from '../../system/createSystemHandle'
import { AppErrorBoundary } from '../../shared/components/window/AppErrorBoundary'
import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { useWindowStore } from '../../shared/store/windowStore'
import type { SandboxFrameRegistration } from './keyboardGuard'

const post = vi.fn()
const del = vi.fn()
vi.mock('../../lib/axios', () => ({
  api: {
    post: (...args: unknown[]) => post(...args) as unknown,
    delete: (...args: unknown[]) => del(...args) as unknown,
  },
}))

// The keyboard guard has its own tests; here, only that the host registers
// its frame with it and acts on a stop.
const registrations: SandboxFrameRegistration[] = []
const unregister = vi.fn()
vi.mock('./keyboardGuard', () => ({
  registerSandboxFrame: (registration: SandboxFrameRegistration) => {
    registrations.push(registration)
    return unregister
  },
}))

const { SandboxedAppHost } = await import('./SandboxedAppHost')

/**
 * Brief 158 — the window side of an app installed from a URL: a token is
 * minted for the window and revoked when it closes, the app runs in an
 * opaque-origin iframe, only that iframe can open the port, and a frame that
 * reports a failure fails inside its own window.
 *
 * jsdom does not load the frame's document, so the tests play the frame: they
 * send its `sandbox-ready` from the iframe's real `contentWindow` and take the
 * port the host transfers back.
 *
 * The app's window and a Notepad window are real windows in the store, with
 * Notepad in front unless a test raises the app.
 */

const TOKEN = 'tok_0123456789abcdefABCDEF-xyz'

let container: HTMLDivElement
let root: Root
let system: SystemHandle
let hostWin: string
let otherWin: string
const ports: MessagePort[] = []

function openTestWindow(appId: string): string {
  return useWindowStore
    .getState()
    .openWindow(appId, appId, { width: 400, height: 300 }, { width: 200, height: 150 })
}

/** Make the app's window the focused one, or put Notepad in front of it. */
const focusHost = () => act(() => useWindowStore.getState().focusWindow(hostWin))
const focusOther = () => act(() => useWindowStore.getState().focusWindow(otherWin))

function app(overrides: Partial<MarketplaceApp> = {}): MarketplaceApp {
  return {
    id: 'x-0123456789ab',
    name: 'Hollow',
    description: '',
    meta: [],
    type: 'static',
    icon: 'gamepad-2',
    window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 640, h: 400 } },
    capabilities: ['notify'],
    minSystemVersion: 2,
    ref: 'c'.repeat(40),
    runtime: 'sandboxed',
    source: {
      url: 'https://github.com/o/hollow',
      repo: 'https://github.com/o/hollow',
      ref: null,
      commit: 'c'.repeat(40),
      subdir: null,
    },
    installed: { ref: 'c'.repeat(40), buildId: 'url', installedAt: 0, missing: false },
    job: null,
    server: { state: 'stopped' },
    ...overrides,
  }
}

function mount(a: MarketplaceApp) {
  act(() => {
    root.render(
      <AppErrorBoundary
        appId={a.id}
        appName={a.name}
        fallback={(error) => <p data-testid="fallback">{error.message}</p>}
      >
        <SystemProvider system={system}>
          <SandboxedAppHost windowId={hostWin} app={a} />
        </SystemProvider>
      </AppErrorBoundary>
    )
  })
}

/** Let the mint, port messages and re-renders run to the end. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

const frame = () => container.querySelector('iframe')
const shield = () => container.querySelector('[data-sandbox-shield]')
const fallback = () => container.querySelector('[data-testid="fallback"]')?.textContent

/** Spy on what the host posts into its frame. */
function watchFrame() {
  const target = frame()!.contentWindow!
  const spy = vi.spyOn(target, 'postMessage').mockImplementation(() => undefined)
  return { target, spy }
}

/** The frame (or anyone) posts `data` to the desktop's window, from `source`. */
function postFrom(source: Window | null, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }))
  })
}

type Init = { imb: string; v: number; init: Record<string, unknown> }

/** The init the host posted last, and the port it transferred with it. */
function lastInit(spy: ReturnType<typeof watchFrame>['spy']): { message: Init; port: MessagePort } {
  const [message, targetOrigin, transfer] = spy.mock.lastCall as unknown as [
    Init,
    string,
    MessagePort[],
  ]
  expect(targetOrigin).toBe('*')
  expect(transfer).toHaveLength(1)
  ports.push(transfer[0])
  return { message, port: transfer[0] }
}

/** Collect what arrives on the frame's end of the port. */
function listen(port: MessagePort): unknown[] {
  const got: unknown[] = []
  port.onmessage = (event) => got.push(event.data)
  return got
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container, { onCaughtError: () => undefined })
  useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {} })
  hostWin = openTestWindow('x-0123456789ab')
  otherWin = openTestWindow('notepad')
  useWindowStore.getState().focusWindow(otherWin)
  system = createSystemHandle('x-0123456789ab', hostWin)
  post.mockReset()
  del.mockReset()
  registrations.length = 0
  unregister.mockReset()
  post.mockResolvedValue({ data: { path: `marketplace/sandbox/${TOKEN}/` } })
  del.mockResolvedValue({})
  vi.stubEnv('VITE_API_URL', '/imbatranim-os/api')
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(document.activeElement as HTMLElement | null)?.blur()
  for (const port of ports.splice(0)) port.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('SandboxedAppHost', () => {
  it('mints a token and frames it with scripts allowed and the same origin never', async () => {
    mount(app())
    await settle()
    expect(post).toHaveBeenCalledWith('/marketplace/apps/x-0123456789ab/sandbox', {})
    const iframe = frame()!
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock')
    expect(iframe.getAttribute('sandbox')).not.toMatch(/allow-same-origin/)
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.getAttribute('title')).toBe('Hollow')
    // Under the API's base, as the native host builds its module URL.
    expect(iframe.src).toBe(
      new URL(`/imbatranim-os/api/marketplace/sandbox/${TOKEN}/`, window.location.href).href
    )
  })

  it('ignores a ready from any window but its frame, or of the wrong shape', async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()

    const other = document.createElement('iframe')
    document.body.appendChild(other)
    postFrom(window, { imb: 'sandbox-ready', v: 1 })
    postFrom(other.contentWindow, { imb: 'sandbox-ready', v: 1 })
    postFrom(null, { imb: 'sandbox-ready', v: 1 })
    postFrom(target, { imb: 'sandbox-ready', v: 2 })
    postFrom(target, { imb: 'sandbox-hello', v: 1 })
    postFrom(target, 'sandbox-ready')
    other.remove()

    expect(spy).not.toHaveBeenCalled()
  })

  it('answers its frame with an init and a port the app can call through', async () => {
    const setTitle = vi.spyOn(system.window, 'setTitle').mockImplementation(() => undefined)
    mount(app())
    await settle()
    expect(container.textContent).toContain('Loading…')
    const { target, spy } = watchFrame()

    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    const { message, port } = lastInit(spy)
    expect(message).toMatchObject({ imb: 'sandbox-init', v: 1 })
    expect(message.init).toMatchObject({
      appId: 'x-0123456789ab',
      windowId: hostWin,
      protocolVersion: 2,
      capabilities: ['notify'],
      appearance: { theme: expect.any(String), accent: expect.any(String) },
      focused: expect.any(Boolean),
      visible: expect.any(Boolean),
    })

    const got = listen(port)
    port.postMessage({ t: 'call', id: 1, path: 'window.setTitle', args: ['Hollow — year 12'] })
    port.postMessage({ t: 'call', id: 2, path: 'fs.read', args: ['home', 'secrets'] })
    port.postMessage({ t: 'mounted' })
    await settle()
    expect(setTitle).toHaveBeenCalledWith('Hollow — year 12')
    expect(got).toContainEqual({ t: 'return', id: 1, ok: true, value: null })
    expect(got).toContainEqual(expect.objectContaining({ t: 'return', id: 2, ok: false }))
    expect(container.textContent).not.toContain('Loading…')
  })

  it('keeps capabilities the sandbox does not implement out of init', async () => {
    mount(app({ capabilities: ['notify', 'fs', 'http'] }))
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    expect(lastInit(spy).message.init.capabilities).toEqual(['notify'])
  })

  it('gives a reloaded frame a fresh port and closes the old one', async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()

    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const first = lastInit(spy).port
    const firstGot = listen(first)
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const second = lastInit(spy).port
    expect(second).not.toBe(first)
    await settle()
    expect(firstGot).toEqual([{ t: 'unmount' }])

    const secondGot = listen(second)
    second.postMessage({ t: 'call', id: 9, path: 'window.hide', args: [] })
    await settle()
    expect(secondGot).toContainEqual({ t: 'return', id: 9, ok: true, value: null })
  })

  it("keeps a reloaded frame's setTitle allowance used up", async () => {
    const setTitle = vi.spyOn(system.window, 'setTitle').mockImplementation(() => undefined)
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const first = lastInit(spy).port
    for (let id = 1; id <= 4; id++) {
      first.postMessage({ t: 'call', id, path: 'window.setTitle', args: [`t${id}`] })
    }
    await settle()
    expect(setTitle).toHaveBeenCalledTimes(4)

    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const second = lastInit(spy).port
    const got = listen(second)
    second.postMessage({ t: 'call', id: 5, path: 'window.setTitle', args: ['t5'] })
    await settle()
    expect(got).toContainEqual({
      t: 'return',
      id: 5,
      ok: false,
      error: 'setTitle: at most 4 a second',
    })
    expect(setTitle).toHaveBeenCalledTimes(4)
  })

  it('ignores activate, focus and show while its frame does not have the keyboard', async () => {
    const focus = vi.spyOn(system.window, 'focus').mockImplementation(() => undefined)
    const show = vi.spyOn(system.window, 'show').mockImplementation(() => undefined)
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const { port } = lastInit(spy)
    const got = listen(port)
    expect(document.activeElement).not.toBe(frame())

    port.postMessage({ t: 'activate' })
    port.postMessage({ t: 'call', id: 1, path: 'window.focus', args: [] })
    port.postMessage({ t: 'call', id: 2, path: 'window.show', args: [] })
    await settle()
    expect(focus).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(got).toContainEqual({
      t: 'return',
      id: 1,
      ok: false,
      error: 'focus is only available while the owner is using the app',
    })
    expect(got).toContainEqual({
      t: 'return',
      id: 2,
      ok: false,
      error: 'show is only available while the owner is using the app',
    })
  })

  it('refuses activate, focus and show in the background even with the keyboard in the frame', async () => {
    const focus = vi.spyOn(system.window, 'focus').mockImplementation(() => undefined)
    const show = vi.spyOn(system.window, 'show').mockImplementation(() => undefined)
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const { port } = lastInit(spy)
    const got = listen(port)
    // The frame took the keyboard (and has not been handed back yet).
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(frame())
    expect(system.window.isFocused()).toBe(false)

    port.postMessage({ t: 'activate' })
    port.postMessage({ t: 'call', id: 1, path: 'window.focus', args: [] })
    port.postMessage({ t: 'call', id: 2, path: 'window.show', args: [] })
    await settle()
    expect(focus).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(got).toContainEqual(expect.objectContaining({ id: 1, ok: false }))
    expect(got).toContainEqual(expect.objectContaining({ id: 2, ok: false }))
  })

  it('allows activate and focus only while its window is focused and the frame has the keyboard', async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const { port } = lastInit(spy)
    const got = listen(port)
    focusHost()
    const focus = vi.spyOn(system.window, 'focus').mockImplementation(() => undefined)

    // Focused, but the keyboard is elsewhere on the page.
    port.postMessage({ t: 'call', id: 3, path: 'window.focus', args: [] })
    await settle()
    expect(got).toContainEqual(expect.objectContaining({ id: 3, ok: false }))

    act(() => frame()!.focus())
    expect(document.activeElement).toBe(frame())
    port.postMessage({ t: 'activate' })
    port.postMessage({ t: 'call', id: 4, path: 'window.focus', args: [] })
    await settle()
    expect(got).toContainEqual({ t: 'return', id: 4, ok: true, value: null })
    expect(focus).toHaveBeenCalledTimes(2)
  })

  it('covers the frame with a shield while its window is in the background', async () => {
    mount(app())
    await settle()
    expect(system.window.isFocused()).toBe(false)
    expect(shield()).not.toBeNull()
    focusHost()
    expect(shield()).toBeNull()
    focusOther()
    expect(shield()).not.toBeNull()
  })

  it('raises the window on a press on the shield, uses the press up, then gives the frame the keyboard', async () => {
    const focus = vi.spyOn(system.window, 'focus')
    mount(app())
    await settle()
    const press = new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    act(() => {
      shield()!.dispatchEvent(press)
    })
    expect(press.defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(system.window.isFocused()).toBe(true)
    expect(shield()).toBeNull()
    // Not during the press: the browser's default for it would take the focus back.
    expect(document.activeElement).not.toBe(frame())
    await settle()
    expect(document.activeElement).toBe(frame())
  })

  it('puts its frame under the keyboard guard, and lets go of it when the window closes', async () => {
    mount(app())
    expect(registrations).toEqual([])
    await settle()
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toMatchObject({ windowId: hostWin, name: 'Hollow', frame: frame() })
    expect(unregister).not.toHaveBeenCalled()
    act(() => root.render(<></>))
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it("shows the guard's stop in the window's error panel and tears the frame down", async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const got = listen(lastInit(spy).port)
    const reason =
      'Hollow took the keyboard while its window was in the background, so it was stopped.'
    act(() => registrations[0].stop(reason))
    await settle()
    expect(fallback()).toBe(reason)
    expect(frame()).toBeNull()
    expect(got).toEqual([{ t: 'unmount' }])
    expect(del).toHaveBeenCalledWith(`/marketplace/sandbox/${TOKEN}`)
    expect(unregister).toHaveBeenCalled()
  })

  it('removes every listener and subscription when the window closes', async () => {
    const targets = [window, document] as const
    const adds = targets.map((t) => vi.spyOn(t, 'addEventListener'))
    const removes = targets.map((t) => vi.spyOn(t, 'removeEventListener'))
    const offs: ReturnType<typeof vi.fn>[] = []
    const on = system.on.bind(system)
    vi.spyOn(system, 'on').mockImplementation(((event: never, cb: never) => {
      const off = vi.fn(on(event, cb))
      offs.push(off)
      return off
    }) as SystemHandle['on'])

    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    lastInit(spy)
    act(() => root.render(<></>))
    await settle()

    const watched = new Set(['message', 'blur', 'focusin', 'focus'])
    targets.forEach((_, i) => {
      const added = adds[i].mock.calls.filter(([type]) => watched.has(type))
      for (const [type, fn] of added) {
        expect(removes[i].mock.calls.some(([t, f]) => t === type && f === fn)).toBe(true)
      }
    })
    expect(adds[0].mock.calls.map(([type]) => type)).toContain('message')
    expect(offs.length).toBeGreaterThan(0)
    for (const off of offs) expect(off).toHaveBeenCalled()
  })

  it("shows the frame's failure in the window's error panel and revokes the token", async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const { port } = lastInit(spy)

    port.postMessage({ t: 'failed', message: 'Hollow needs WebGL 2' })
    await settle()
    expect(fallback()).toBe('Hollow needs WebGL 2')
    expect(frame()).toBeNull()
    expect(del).toHaveBeenCalledWith(`/marketplace/sandbox/${TOKEN}`)
  })

  it('tells the app to unmount and revokes the token when the window closes', async () => {
    mount(app())
    await settle()
    const { target, spy } = watchFrame()
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    const got = listen(lastInit(spy).port)
    expect(del).not.toHaveBeenCalled()

    act(() => root.render(<></>))
    await settle()
    expect(del).toHaveBeenCalledWith(`/marketplace/sandbox/${TOKEN}`)
    expect(got).toEqual([{ t: 'unmount' }])

    // The listener went with the window.
    postFrom(target, { imb: 'sandbox-ready', v: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('revokes a token that arrives after the window already closed', async () => {
    let resolve: (value: unknown) => void = () => undefined
    post.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    mount(app())
    act(() => root.render(<></>))
    resolve({ data: { path: `marketplace/sandbox/${TOKEN}/` } })
    await settle()
    expect(del).toHaveBeenCalledWith(`/marketplace/sandbox/${TOKEN}`)
  })

  it('refuses an app that needs a newer system protocol, before minting anything', async () => {
    mount(app({ minSystemVersion: 99 }))
    await settle()
    expect(fallback()).toMatch(/needs system protocol 99/)
    expect(post).not.toHaveBeenCalled()
    expect(frame()).toBeNull()
  })

  it("shows a refused mint in the window's error panel", async () => {
    post.mockRejectedValueOnce({ response: { status: 404, data: { message: 'Not Found' } } })
    mount(app())
    await settle()
    expect(fallback()).toBe('Hollow could not start: Not Found')
    expect(frame()).toBeNull()
  })

  it('frames nothing when the mint answers with something other than a sandbox path', async () => {
    post.mockResolvedValueOnce({ data: { path: 'https://evil.example/x/' } })
    mount(app())
    await settle()
    expect(fallback()).toMatch(/could not start/)
    expect(frame()).toBeNull()
  })
})
