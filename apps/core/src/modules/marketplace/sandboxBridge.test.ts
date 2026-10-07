import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PROTOCOL_VERSION, type SystemHandle } from '@imbatranim/ui'
import type { Capability } from '../../shared/registry/marketplace'
import {
  CLOSE_AGAIN_MS,
  CLOSE_ASK_TIMEOUT_MS,
  createSandboxBridge,
  createSandboxWindowState,
  NOTIFY_WINDOW_MS,
  sandboxCapabilities,
  sandboxInit,
  TITLE_WINDOW_MS,
  type BridgePort,
  type SandboxBridgeOptions,
} from './sandboxBridge'
import { scopeHandle } from './scopeHandle'

/**
 * Brief 158, contract C — the desktop's side of a sandboxed app's port. The
 * frame is untrusted: what matters is that only the named calls get through,
 * checked; that a bad message is dropped rather than thrown; and that the app
 * can neither hold its window open nor keep anything alive past dispose.
 */

type Listener = (event: { data: unknown }) => void

/** A port that delivers synchronously, cloning what the bridge sends as a real port would. */
function fakePort() {
  const listeners = new Set<Listener>()
  const sent: Record<string, unknown>[] = []
  const state = { started: false, closed: false }
  const port: BridgePort = {
    postMessage: (message) => {
      if (!state.closed) sent.push(structuredClone(message) as Record<string, unknown>)
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    start: () => {
      state.started = true
    },
    close: () => {
      state.closed = true
    },
  }
  /** The frame sends `data`. */
  const send = (data: unknown) => {
    for (const listener of [...listeners]) listener({ data })
  }
  return { port, sent, send, state, listeners }
}

/** The window's handle, with the parts the bridge touches recorded. */
function fakeSystem() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>()
  let guard: (() => boolean | Promise<boolean>) | null = null
  const win = {
    setTitle: vi.fn(),
    requestClose: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    isFocused: () => true,
    isVisible: () => false,
    onCloseRequest: vi.fn((g: () => boolean | Promise<boolean>) => {
      guard = g
      return () => {
        if (guard === g) guard = null
      }
    }),
  }
  const notify = vi.fn((_input: unknown) => 'note-1')
  const system = {
    protocolVersion: PROTOCOL_VERSION,
    appId: 'x-0123456789ab',
    windowId: 'w1',
    fs: {},
    http: {},
    intents: {},
    shortcuts: {},
    schedule: {},
    window: win,
    appearance: { get: () => ({ theme: 'dark', accent: '#ff8800' }) },
    notify,
    on: (event: string, cb: (payload: unknown) => void) => {
      const set = handlers.get(event) ?? new Set()
      set.add(cb)
      handlers.set(event, set)
      return () => set.delete(cb)
    },
  } as unknown as SystemHandle
  const emit = (event: string, payload?: unknown) => {
    for (const cb of handlers.get(event) ?? []) cb(payload)
  }
  const subscribed = () => [...handlers.values()].reduce((n, set) => n + set.size, 0)
  return { system, win, notify, emit, subscribed, guard: () => guard }
}

let clock: number
/** Whether the owner is in the frame, as the host's `isEngaged` would say. */
let engaged: boolean
let p: ReturnType<typeof fakePort>
let s: ReturnType<typeof fakeSystem>
let callbacks: {
  onActivate: Mock<() => void>
  onMounted: Mock<() => void>
  onFailed: Mock<(message: string) => void>
}

function bridge(
  capabilities: Capability[] = ['notify'],
  extra: Partial<SandboxBridgeOptions> = {}
) {
  return createSandboxBridge({
    port: p.port,
    system: scopeHandle(s.system, capabilities, 'Hollow'),
    capabilities,
    isEngaged: () => engaged,
    now: () => clock,
    ...callbacks,
    ...extra,
  })
}

/** The frame calls `path` and gets back the answer. */
function call(path: string, args: unknown = [], id: number | string = Math.random()) {
  p.send({ t: 'call', id, path, args })
  const answer = p.sent.filter((m) => m.t === 'return' && m.id === id)
  expect(answer).toHaveLength(1)
  return answer[0]
}

beforeEach(() => {
  clock = 1_000_000
  engaged = false
  p = fakePort()
  s = fakeSystem()
  callbacks = { onActivate: vi.fn(), onMounted: vi.fn(), onFailed: vi.fn() }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('sandboxBridge: calls', () => {
  it('starts the port it listens on', () => {
    bridge()
    expect(p.state.started).toBe(true)
  })

  it.each([
    ['window.requestClose', 'requestClose'],
    ['window.hide', 'hide'],
  ] as const)('answers %s by calling the window', (path, method) => {
    bridge()
    expect(call(path, [], 7)).toEqual({ t: 'return', id: 7, ok: true, value: null })
    expect(s.win[method]).toHaveBeenCalledTimes(1)
  })

  it('answers window.setTitle with a string of up to 200 characters', () => {
    bridge()
    expect(call('window.setTitle', ['Hollow — day 3'])).toMatchObject({ ok: true })
    expect(call('window.setTitle', ['t'.repeat(200)])).toMatchObject({ ok: true })
    expect(call('window.setTitle', [''])).toMatchObject({ ok: true })
    expect(s.win.setTitle.mock.calls).toEqual([['Hollow — day 3'], ['t'.repeat(200)], ['']])
  })

  it.each([[['t'.repeat(201)]], [[42]], [[]], [[{ title: 'x' }]]])(
    'refuses window.setTitle with %j',
    (args) => {
      bridge()
      const answer = call('window.setTitle', args)
      expect(answer).toMatchObject({ ok: false })
      expect(typeof answer.error).toBe('string')
      expect(s.win.setTitle).not.toHaveBeenCalled()
    }
  )

  it("echoes the frame's call id, a number or a string", () => {
    bridge()
    expect(call('window.hide', [], 'call-9')).toMatchObject({ id: 'call-9', ok: true })
    expect(call('window.hide', [], 0)).toMatchObject({ id: 0, ok: true })
  })

  it.each([
    'fs.read',
    'http.get',
    'intents.openApp',
    'window.onCloseRequest',
    'constructor',
    '__proto__',
    'toString',
    '',
  ])('answers the unknown path %j with an error', (path) => {
    bridge()
    const answer = call(path)
    expect(answer).toMatchObject({ t: 'return', ok: false })
    expect(answer.error).toMatch(/unknown call/)
  })

  it('answers a call whose args are not a list with an error', () => {
    bridge()
    expect(call('window.focus', { not: 'a list' })).toMatchObject({
      ok: false,
      error: 'args must be an array',
    })
    expect(s.win.focus).not.toHaveBeenCalled()
  })

  it('reads missing args as none', () => {
    bridge()
    p.send({ t: 'call', id: 3, path: 'window.hide' })
    expect(p.sent).toContainEqual({ t: 'return', id: 3, ok: true, value: null })
  })

  it("answers with an error when the window's handle throws, and throws nothing itself", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    s.win.hide.mockImplementation(() => {
      throw new Error('internal detail')
    })
    bridge()
    expect(() => call('window.hide')).not.toThrow()
    const answer = p.sent.find((m) => m.t === 'return')!
    expect(answer).toMatchObject({ ok: false, error: 'window.hide failed' })
    expect(error).toHaveBeenCalled()
  })
})

describe('sandboxBridge: an app cannot raise its own window', () => {
  // `isEngaged` is the host's `document.activeElement === iframe` and "this
  // window is the focused one". Nothing the frame sends can make it true.
  it.each([
    ['window.focus', 'focus'],
    ['window.show', 'show'],
  ] as const)('refuses %s while the owner is not in the frame', (path, method) => {
    bridge()
    expect(call(path, [], 4)).toEqual({
      t: 'return',
      id: 4,
      ok: false,
      error: `${method} is only available while the owner is using the app`,
    })
    expect(s.win[method]).not.toHaveBeenCalled()
  })

  it.each([
    ['window.focus', 'focus'],
    ['window.show', 'show'],
  ] as const)(
    'answers %s by calling the window while the owner is in the frame',
    (path, method) => {
      engaged = true
      bridge()
      expect(call(path, [], 7)).toEqual({ t: 'return', id: 7, ok: true, value: null })
      expect(s.win[method]).toHaveBeenCalledTimes(1)
    }
  )

  it('asks whether the owner is in the frame at each call', () => {
    bridge()
    expect(call('window.focus')).toMatchObject({ ok: false })
    engaged = true
    expect(call('window.focus')).toMatchObject({ ok: true })
    engaged = false
    expect(call('window.show')).toMatchObject({ ok: false })
    expect(s.win.focus).toHaveBeenCalledTimes(1)
    expect(s.win.show).not.toHaveBeenCalled()
  })

  it('ignores activate while the owner is not in the frame', () => {
    bridge()
    p.send({ t: 'activate' })
    p.send({ t: 'activate' })
    expect(callbacks.onActivate).not.toHaveBeenCalled()
    engaged = true
    p.send({ t: 'activate' })
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1)
    expect(p.sent).toEqual([])
  })
})

describe('sandboxBridge: notify', () => {
  it('raises the notification, keeping only title, body and level', () => {
    bridge()
    const answer = call('notify', [
      {
        title: 'Spring',
        body: 'A new generation was born.',
        level: 'success',
        actions: [{ label: 'Open', payload: { evil: true } }],
        appId: 'settings',
      },
    ])
    expect(answer).toMatchObject({ ok: true, value: 'note-1' })
    expect(s.notify).toHaveBeenCalledWith({
      title: 'Spring',
      body: 'A new generation was born.',
      level: 'success',
    })
  })

  it('passes a title alone', () => {
    bridge()
    expect(call('notify', [{ title: 'Hi' }])).toMatchObject({ ok: true })
    expect(s.notify).toHaveBeenCalledWith({ title: 'Hi' })
  })

  it('refuses notify when the app did not ask for it', () => {
    bridge([])
    const answer = call('notify', [{ title: 'Hi' }])
    expect(answer).toMatchObject({ ok: false })
    expect(answer.error).toMatch(/did not ask for system\.notify/)
    expect(s.notify).not.toHaveBeenCalled()
  })

  it.each([
    ['no input', []],
    ['a string', ['Hi']],
    ['a list', [['Hi']]],
    ['no title', [{ body: 'b' }]],
    ['an empty title', [{ title: '' }]],
    ['a long title', [{ title: 't'.repeat(201) }]],
    ['a numeric title', [{ title: 5 }]],
    ['a long body', [{ title: 'Hi', body: 'b'.repeat(2001) }]],
    ['a numeric body', [{ title: 'Hi', body: 5 }]],
    ['an unknown level', [{ title: 'Hi', level: 'critical' }]],
  ])('refuses notify with %s', (_label, args) => {
    bridge()
    expect(call('notify', args)).toMatchObject({ ok: false })
    expect(s.notify).not.toHaveBeenCalled()
  })

  it('takes the longest title and body allowed', () => {
    bridge()
    expect(call('notify', [{ title: 't'.repeat(200), body: 'b'.repeat(2000) }])).toMatchObject({
      ok: true,
    })
  })

  it('allows 5 every 10 seconds, and counts only the ones raised', () => {
    bridge()
    call('notify', [{ title: '' }]) // refused: does not count
    for (let i = 0; i < 5; i++) {
      expect(call('notify', [{ title: `n${i}` }])).toMatchObject({ ok: true })
      clock += 1000
    }
    expect(call('notify', [{ title: 'n5' }])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at most 5/),
    })
    expect(s.notify).toHaveBeenCalledTimes(5)

    // The first left the window 10 s after it was raised.
    clock = 1_000_000 + NOTIFY_WINDOW_MS
    expect(call('notify', [{ title: 'n6' }])).toMatchObject({ ok: true })
    expect(call('notify', [{ title: 'n7' }])).toMatchObject({ ok: false })
    expect(s.notify).toHaveBeenCalledTimes(6)
  })

  it('keeps the limit across bridges that share a window log', () => {
    // A frame can send ready again at will; the host hands every bridge of a
    // window the same log, so a fresh channel is not a fresh allowance.
    const shared = createSandboxWindowState()
    bridge(['notify'], { shared })
    for (let i = 0; i < 5; i++) call('notify', [{ title: 'n' }])
    expect(call('notify', [{ title: 'n' }])).toMatchObject({ ok: false })
    p = fakePort()
    bridge(['notify'], { shared })
    expect(call('notify', [{ title: 'n' }])).toMatchObject({ ok: false })
    expect(s.notify).toHaveBeenCalledTimes(5)
  })
})

describe('sandboxBridge: setTitle rate limit', () => {
  it('allows 4 a second, and counts only the titles set', () => {
    bridge()
    call('window.setTitle', [42]) // refused: does not count
    for (let i = 0; i < 4; i++) {
      expect(call('window.setTitle', [`t${i}`])).toMatchObject({ ok: true })
      clock += 100
    }
    expect(call('window.setTitle', ['t4'])).toMatchObject({
      ok: false,
      error: 'setTitle: at most 4 a second',
    })
    expect(s.win.setTitle).toHaveBeenCalledTimes(4)

    // The first left the window a second after it was set.
    clock = 1_000_000 + TITLE_WINDOW_MS
    expect(call('window.setTitle', ['t5'])).toMatchObject({ ok: true })
    expect(call('window.setTitle', ['t6'])).toMatchObject({ ok: false })
    expect(s.win.setTitle).toHaveBeenCalledTimes(5)
  })

  it('keeps the limit across bridges that share the window state', () => {
    // A fresh ready is a fresh bridge, not a fresh allowance.
    const shared = createSandboxWindowState()
    bridge([], { shared })
    for (let i = 0; i < 4; i++) call('window.setTitle', ['t'])
    p = fakePort()
    bridge([], { shared })
    expect(call('window.setTitle', ['t'])).toMatchObject({
      ok: false,
      error: 'setTitle: at most 4 a second',
    })
    expect(s.win.setTitle).toHaveBeenCalledTimes(4)
  })
})

describe('sandboxBridge: malformed messages', () => {
  class Shaped {
    t = 'activate'
  }

  it.each([
    ['null', null],
    ['a string', 'activate'],
    ['a number', 1],
    ['a list', [{ t: 'activate' }]],
    ['a class instance', new Shaped()],
    ['an empty object', {}],
    ['an unknown t', { t: 'eval', code: '1' }],
    ['a call without an id', { t: 'call', path: 'window.focus', args: [] }],
    ['a call with an object id', { t: 'call', id: {}, path: 'window.focus', args: [] }],
    ['a call with a NaN id', { t: 'call', id: Number.NaN, path: 'window.focus', args: [] }],
    [
      'a call with a huge string id',
      { t: 'call', id: 'i'.repeat(101), path: 'window.focus', args: [] },
    ],
    ['a call with a numeric path', { t: 'call', id: 1, path: 5, args: [] }],
    ['a close-guard without set', { t: 'close-guard' }],
    ['a close-guard with a string set', { t: 'close-guard', set: 'true' }],
    ['a close-answer with a string id', { t: 'close-answer', id: '1', allow: true }],
    ['a close-answer with a string allow', { t: 'close-answer', id: 1, allow: 'yes' }],
  ])('drops %s silently', (_label, data) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const b = bridge()
    expect(() => p.send(data)).not.toThrow()
    expect(p.sent).toEqual([])
    expect(callbacks.onActivate).not.toHaveBeenCalled()
    expect(s.win.focus).not.toHaveBeenCalled()
    expect(s.win.onCloseRequest).not.toHaveBeenCalled()
    expect(b.dropped).toBe(1)
  })

  it('counts every drop, and warns in development once per bridge', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const b = bridge()
    p.send(null)
    p.send({ t: 'nope' })
    p.send({ t: 'close-guard', set: 1 })
    expect(b.dropped).toBe(3)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/x-0123456789ab: dropped a message/)
  })
})

describe('sandboxBridge: events', () => {
  it('forwards focus, blur, visibility and appearance changes', () => {
    bridge()
    s.emit('focus')
    s.emit('blur')
    s.emit('visibility', false)
    s.emit('appearance-changed', { theme: 'light', accent: '#123456' })
    expect(p.sent).toEqual([
      { t: 'event', name: 'focus', payload: undefined },
      { t: 'event', name: 'blur', payload: undefined },
      { t: 'event', name: 'visibility', payload: false },
      { t: 'event', name: 'appearance-changed', payload: { theme: 'light', accent: '#123456' } },
    ])
  })

  it('unsubscribes on dispose', () => {
    const b = bridge()
    expect(s.subscribed()).toBe(4)
    b.dispose()
    expect(s.subscribed()).toBe(0)
  })
})

describe('sandboxBridge: the close guard', () => {
  it('registers a guard that asks the frame and closes on its answer', async () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    expect(s.win.onCloseRequest).toHaveBeenCalledTimes(1)
    const guard = s.guard()!

    const first = guard()
    const ask = p.sent.find((m) => m.t === 'close-ask')!
    expect(ask).toEqual({ t: 'close-ask', id: expect.any(Number) })
    p.send({ t: 'close-answer', id: 999, allow: true }) // not an ask of ours: ignored
    p.send({ t: 'close-answer', id: ask.id, allow: false })
    await expect(first).resolves.toBe(false)

    // Past the press-close-twice window, so the frame is asked again.
    clock += CLOSE_AGAIN_MS
    p.sent.length = 0
    const second = guard()
    const ask2 = p.sent.find((m) => m.t === 'close-ask')!
    expect(ask2.id).not.toBe(ask.id)
    p.send({ t: 'close-answer', id: ask2.id, allow: true })
    await expect(second).resolves.toBe(true)
  })

  it('takes the first answer to an ask and ignores a second', async () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    const pending = s.guard()!()
    const ask = p.sent.find((m) => m.t === 'close-ask')!
    p.send({ t: 'close-answer', id: ask.id, allow: false })
    p.send({ t: 'close-answer', id: ask.id, allow: true })
    await expect(pending).resolves.toBe(false)
  })

  it('lets the window close when the frame does not answer in 60 s', async () => {
    vi.useFakeTimers()
    bridge()
    p.send({ t: 'close-guard', set: true })
    let verdict: boolean | undefined
    void (s.guard()!() as Promise<boolean>).then((v) => (verdict = v))
    await vi.advanceTimersByTimeAsync(CLOSE_ASK_TIMEOUT_MS - 1)
    expect(verdict).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(verdict).toBe(true)
  })

  it('registers one guard however often the frame sets it, and drops it on set:false', () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    p.send({ t: 'close-guard', set: true })
    expect(s.win.onCloseRequest).toHaveBeenCalledTimes(1)
    p.send({ t: 'close-guard', set: false })
    expect(s.guard()).toBeNull()
    p.send({ t: 'close-guard', set: false })
    p.send({ t: 'close-guard', set: true })
    expect(s.win.onCloseRequest).toHaveBeenCalledTimes(2)
    expect(s.guard()).not.toBeNull()
  })

  it('lets a pending close go ahead on dispose, and drops the guard', async () => {
    const b = bridge()
    p.send({ t: 'close-guard', set: true })
    const guard = s.guard()!
    const pending = guard()
    b.dispose()
    await expect(pending).resolves.toBe(true)
    expect(s.guard()).toBeNull()
    await expect(guard()).resolves.toBe(true)
  })
})

describe('sandboxBridge: press close twice', () => {
  /** Close once, and have the frame refuse. */
  async function refuse(guard: () => boolean | Promise<boolean>) {
    p.sent.length = 0
    const pending = guard()
    const ask = p.sent.find((m) => m.t === 'close-ask')!
    expect(ask).toBeDefined()
    p.send({ t: 'close-answer', id: ask.id, allow: false })
    await expect(pending).resolves.toBe(false)
  }

  const asked = () => p.sent.filter((m) => m.t === 'close-ask')

  it('closes without asking when the app refused a close under 10 s ago', async () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    const guard = s.guard()!
    await refuse(guard)

    clock += CLOSE_AGAIN_MS - 1
    p.sent.length = 0
    await expect(guard()).resolves.toBe(true)
    expect(asked()).toEqual([])
  })

  it('asks again when the second close comes 10 s or more after the refusal', async () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    const guard = s.guard()!
    await refuse(guard)

    clock += CLOSE_AGAIN_MS
    await refuse(guard) // asked again, and refused again

    // That refusal starts a new 10 s.
    clock += 1
    p.sent.length = 0
    await expect(guard()).resolves.toBe(true)
    expect(asked()).toEqual([])
  })

  it('remembers the refusal when the frame sends ready again', async () => {
    const shared = createSandboxWindowState()
    const first = bridge(['notify'], { shared })
    p.send({ t: 'close-guard', set: true })
    await refuse(s.guard()!)
    first.dispose()

    p = fakePort()
    bridge(['notify'], { shared })
    p.send({ t: 'close-guard', set: true })
    clock += 1000
    await expect(s.guard()!()).resolves.toBe(true)
    expect(asked()).toEqual([])
  })

  it('takes neither an allow nor an answer to no ask as a refusal', async () => {
    bridge()
    p.send({ t: 'close-guard', set: true })
    const guard = s.guard()!
    p.send({ t: 'close-answer', id: 999, allow: false })

    p.sent.length = 0
    const first = guard()
    const ask = asked()[0]
    expect(ask).toBeDefined()
    p.send({ t: 'close-answer', id: ask.id, allow: true })
    await expect(first).resolves.toBe(true)

    p.sent.length = 0
    const second = guard()
    expect(asked()).toHaveLength(1)
    p.send({ t: 'close-answer', id: asked()[0].id, allow: true })
    await expect(second).resolves.toBe(true)
  })
})

describe('sandboxBridge: lifecycle', () => {
  it('hands activate (while engaged), mounted and failed to the host', () => {
    engaged = true
    bridge()
    p.send({ t: 'activate' })
    p.send({ t: 'mounted' })
    p.send({ t: 'failed', message: 'mount threw: no WebGL' })
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1)
    expect(callbacks.onMounted).toHaveBeenCalledTimes(1)
    expect(callbacks.onFailed).toHaveBeenCalledWith('mount threw: no WebGL')
  })

  it('cuts a long failure message to 500 characters, and words a missing one', () => {
    bridge()
    p.send({ t: 'failed', message: 'x'.repeat(10_000) })
    p.send({ t: 'failed', message: { toString: 'no' } })
    expect(callbacks.onFailed.mock.calls[0][0]).toHaveLength(500)
    expect(callbacks.onFailed.mock.calls[1][0]).toMatch(/stopped while starting/)
  })

  it('swallows a host callback that throws', () => {
    engaged = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    bridge([], {
      onActivate: () => {
        throw new Error('host bug')
      },
    })
    expect(() => p.send({ t: 'activate' })).not.toThrow()
    expect(error).toHaveBeenCalled()
  })

  it('on dispose: tells the frame to unmount, closes the port and hears nothing more', () => {
    engaged = true
    const b = bridge()
    const [listener] = [...p.listeners]
    b.dispose()
    expect(p.sent).toEqual([{ t: 'unmount' }])
    expect(p.state.closed).toBe(true)
    expect(p.listeners.size).toBe(0)

    // Even a message already on its way is ignored, and a second dispose is a no-op.
    listener({ data: { t: 'activate' } })
    expect(callbacks.onActivate).not.toHaveBeenCalled()
    b.dispose()
    expect(p.sent).toEqual([{ t: 'unmount' }])
  })
})

describe('sandboxBridge: the init payload and capabilities', () => {
  it('builds init from the window handle', () => {
    const init = sandboxInit(scopeHandle(s.system, ['notify'], 'Hollow'), ['notify'])
    expect(init).toEqual({
      appId: 'x-0123456789ab',
      windowId: 'w1',
      protocolVersion: PROTOCOL_VERSION,
      capabilities: ['notify'],
      appearance: { theme: 'dark', accent: '#ff8800' },
      focused: true,
      visible: false,
    })
    expect(structuredClone(init)).toEqual(init)
  })

  it('keeps only the capabilities the sandbox implements', () => {
    expect(
      sandboxCapabilities(['fs', 'notify', 'http', 'intents', 'shortcuts', 'schedule'])
    ).toEqual(['notify'])
    expect(sandboxCapabilities([])).toEqual([])
  })
})

describe('sandboxBridge over a real MessageChannel', () => {
  it('answers a call and says unmount on dispose', async () => {
    const channel = new MessageChannel()
    const received: unknown[] = []
    const next = () =>
      new Promise<unknown>((resolve) => {
        channel.port2.onmessage = (event) => {
          received.push(event.data)
          resolve(event.data)
        }
      })

    const b = createSandboxBridge({
      port: channel.port1,
      system: scopeHandle(s.system, ['notify'], 'Hollow'),
      capabilities: ['notify'],
      isEngaged: () => false,
      ...callbacks,
    })
    let answer = next()
    channel.port2.postMessage({ t: 'call', id: 1, path: 'notify', args: [{ title: 'Hi' }] })
    expect(await answer).toEqual({ t: 'return', id: 1, ok: true, value: 'note-1' })

    answer = next()
    channel.port2.postMessage({
      t: 'call',
      id: 2,
      path: 'fs.read',
      args: ['home', '.ssh/id_ed25519'],
    })
    expect(await answer).toMatchObject({ t: 'return', id: 2, ok: false })

    answer = next()
    b.dispose()
    expect(await answer).toEqual({ t: 'unmount' })
    channel.port2.close()
  })
})
