// @vitest-environment jsdom
import { act, lazy, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Brief 180: a new window gets the keyboard once its app has mounted, past
 * the app's lazy chunk, unless the app focused something of its own first.
 * The registry is a stand-in with two apps; the window chrome is the real one.
 */

type Gate = { open: () => void; promise: Promise<void> }
const gate = (): Gate => {
  let open = () => {}
  const promise = new Promise<void>((resolve) => (open = resolve))
  return { open, promise }
}

const { registry, chunk } = vi.hoisted(() => ({
  registry: [] as unknown[],
  chunk: { gate: null as Gate | null },
}))
vi.mock('../../registry/registry', () => ({ APP_REGISTRY: registry }))
vi.mock('../../registry/marketplace', () => ({ useRegistryVersion: () => 0 }))

import { useWindowStore } from '../../store/windowStore'
import { useAuthStore } from '../../../modules/auth/store/authStore'
import { WindowContainer } from './WindowContainer'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A keyboard-first app behind a lazy chunk the test releases. */
function Shell() {
  return (
    <div>
      <textarea data-testid="shell-input" />
    </div>
  )
}
// A fresh lazy per test: React caches a resolved one.
const lazyShell = () =>
  lazy(async () => {
    await chunk.gate!.promise
    return { default: Shell }
  })

/** An app that focuses its own command line as it mounts. */
function Cad() {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div>
      <button data-testid="cad-menu">File</button>
      <input data-testid="cad-cmd" ref={ref} />
    </div>
  )
}

const app = (id: string, component: unknown) => ({
  id,
  name: id,
  component,
  defaultSize: { width: 400, height: 300 },
  minSize: { width: 200, height: 150 },
})

let container: HTMLDivElement
let root: Root
let frames: FrameRequestCallback[]

const flushFrames = () => {
  // Two rounds: the helper waits two frames.
  for (let i = 0; i < 2; i++) {
    const pending = frames
    frames = []
    act(() => {
      for (const cb of pending) cb(0)
    })
  }
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)

function open(appId: string): string {
  let id = ''
  act(() => {
    id = useWindowStore
      .getState()
      .openWindow(appId, appId, { width: 400, height: 300 }, { width: 200, height: 150 })
  })
  return id
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  chunk.gate = gate()
  registry.splice(0, registry.length, app('shell', lazyShell()), app('cad', Cad))
  useAuthStore.setState({ authenticated: true, everAuthenticated: true, locked: false })
  useWindowStore.setState({ windows: [], nextZIndex: 1, activeWorkspace: 1 })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<WindowContainer />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('a new window (brief 180)', () => {
  it('takes the keyboard once its lazy app has mounted', async () => {
    const start = document.createElement('button')
    document.body.appendChild(start)
    start.focus()

    open('shell')
    // Still loading: nothing to focus yet, and nothing is scheduled.
    flushFrames()
    expect(document.activeElement).toBe(start)

    await act(async () => {
      chunk.gate!.open()
      await chunk.gate!.promise
    })
    expect(byTestId('shell-input')).not.toBeNull()
    flushFrames()
    expect(document.activeElement).toBe(byTestId('shell-input'))
    start.remove()
  })

  it("keeps the app's own first focus", () => {
    open('cad')
    expect(document.activeElement).toBe(byTestId('cad-cmd'))
    flushFrames()
    expect(document.activeElement).toBe(byTestId('cad-cmd'))
  })

  it('moves nothing for a window that is not the focused one when it mounts', async () => {
    const cadId = open('cad')
    const cmd = byTestId('cad-cmd')!
    flushFrames()
    // A window brought up behind CAD: its mount must not take the keyboard.
    act(() => {
      useWindowStore
        .getState()
        .openWindow('shell', 'shell', { width: 400, height: 300 }, { width: 200, height: 150 })
      useWindowStore.getState().focusWindow(cadId)
    })
    await act(async () => {
      chunk.gate!.open()
      await chunk.gate!.promise
    })
    flushFrames()
    expect(document.activeElement).toBe(cmd)
  })
})
