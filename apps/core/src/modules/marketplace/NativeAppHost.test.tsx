// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemProvider } from '@imbatranim/ui'
import { createSystemHandle } from '../../system/createSystemHandle'
import { AppErrorBoundary } from '../../shared/components/window/AppErrorBoundary'
import type { MarketplaceApp } from '../../shared/registry/marketplace'

const post = vi.fn()
const del = vi.fn()
vi.mock('../../lib/axios', () => ({
  api: {
    post: (...args: unknown[]) => post(...args) as unknown,
    delete: (...args: unknown[]) => del(...args) as unknown,
  },
}))

// The browser imports the module by URL; the test runner imports the same
// file by path.
vi.mock('./loadModule', () => ({
  loadModule: (url: string) => import(/* @vite-ignore */ fileURLToPath(url)),
}))

const { NativeAppHost } = await import('./NativeAppHost')

/**
 * Brief 120 — the window side of a marketplace app: its module is imported,
 * mounted into the window's node with a scoped handle and the host context,
 * and unmounted on close; a service app's server is leased for exactly as long
 * as the window is open; and a module that cannot run fails inside its window.
 *
 * The module is a real ES module file, imported by URL the way the browser
 * imports it from the backend; the API base is pointed at its directory.
 */

let dir: string
let container: HTMLDivElement
let root: Root
let caught: unknown[]

function app(overrides: Partial<MarketplaceApp> = {}): MarketplaceApp {
  return {
    id: 'orbits',
    name: 'Orbits',
    description: '',
    meta: [],
    type: 'static',
    icon: 'rocket',
    window: { defaultSize: { w: 640, h: 420 }, minSize: { w: 320, h: 240 } },
    capabilities: ['notify'],
    minSystemVersion: 2,
    ref: 'a'.repeat(40),
    runtime: 'native',
    installed: {
      ref: 'a'.repeat(40),
      buildId: 'b1',
      installedAt: 0,
      entryPath: 'app.mjs',
      missing: false,
    },
    job: null,
    server: { state: 'stopped' },
    ...overrides,
  }
}

/** Write the module and point the API base at it. Returns where the module records what it saw. */
function writeModule(source: string, name = 'app.mjs') {
  writeFileSync(join(dir, name), source)
  vi.stubEnv('VITE_API_URL', pathToFileURL(dir).href)
}

function mount(a: MarketplaceApp) {
  const system = createSystemHandle(a.id, null)
  act(() => {
    root.render(
      <AppErrorBoundary
        appId={a.id}
        appName={a.name}
        fallback={(error) => <p data-testid="fallback">{error.message}</p>}
      >
        <SystemProvider system={system}>
          <NativeAppHost windowId="w1" app={a} />
        </SystemProvider>
      </AppErrorBoundary>
    )
  })
}

/** Let the host's async load (lease, import, mount) run to the end. */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

type Seen = {
  mounted?: boolean
  containerIsNode?: boolean
  host?: { appId: string; assetBase: string; server: { http: string; ws: string } | null }
  notify?: string
  fsError?: string
  unmounted?: boolean
}

const seen = () => (globalThis as { __seen?: Seen }).__seen ?? {}

const RECORDING_MODULE = `
const seen = (globalThis.__seen = {})
export function mount(container, system, host) {
  seen.mounted = true
  seen.containerIsNode = container instanceof HTMLElement
  seen.host = host
  seen.notify = typeof system.notify
  try { system.fs } catch (err) { seen.fsError = err.message }
  container.textContent = 'hello from the app'
}
export function unmount(container) {
  seen.unmounted = container instanceof HTMLElement
}
`

beforeEach(() => {
  // Inside the project: the test runner imports nothing from outside its root.
  const cache = join(process.cwd(), 'node_modules', '.cache')
  mkdirSync(cache, { recursive: true })
  dir = mkdtempSync(join(cache, 'native-host-'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container, { onCaughtError: (e) => caught.push(e) })
  caught = []
  delete (globalThis as { __seen?: Seen }).__seen
  post.mockReset()
  del.mockReset()
  post.mockResolvedValue({ data: { lease: 'lease-1', renewMs: 60_000 } })
  del.mockResolvedValue({})
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('NativeAppHost', () => {
  it('mounts the module into the window with a scoped handle, and unmounts it on close', async () => {
    writeModule(RECORDING_MODULE)
    mount(app())
    await settle()
    expect(seen().mounted).toBe(true)
    expect(seen().containerIsNode).toBe(true)
    expect(container.textContent).toContain('hello from the app')
    expect(seen().notify).toBe('function')
    expect(seen().fsError).toMatch(/Orbits did not ask for system\.fs/)
    expect(seen().host?.appId).toBe('orbits')
    expect(seen().host?.assetBase).toBe(`${pathToFileURL(dir).href}/`)
    expect(seen().host?.server).toBeNull()
    expect(post).not.toHaveBeenCalled()

    act(() => root.render(<></>))
    expect(seen().unmounted).toBe(true)
  })

  it("leases a service app's server for as long as the window is open", async () => {
    writeModule(RECORDING_MODULE)
    mount(app({ id: 'pingpong', name: 'Ping Pong', type: 'service' }))
    await settle()
    expect(post).toHaveBeenCalledWith('/marketplace/apps/pingpong/lease', {})
    const server = seen().host?.server
    expect(server?.http).toMatch(/\/marketplace\/apps\/pingpong\/server$/)
    expect(del).not.toHaveBeenCalled()

    act(() => root.render(<></>))
    expect(del).toHaveBeenCalledWith('/marketplace/apps/pingpong/lease/lease-1')
  })

  it('shows a module without mount() as a crash of its own window', async () => {
    writeModule('export const nothing = 1\n')
    mount(app())
    await settle()
    expect(container.querySelector('[data-testid="fallback"]')?.textContent).toMatch(
      /does not export mount/
    )
  })

  it('shows a mount() that throws as a crash of its own window', async () => {
    writeModule('export function mount() { throw new Error("the game broke") }\n')
    mount(app())
    await settle()
    expect(container.querySelector('[data-testid="fallback"]')?.textContent).toBe('the game broke')
  })

  it('refuses an app that needs a newer system protocol, before loading it', async () => {
    writeModule(RECORDING_MODULE)
    mount(app({ minSystemVersion: 99 }))
    await settle()
    expect(container.querySelector('[data-testid="fallback"]')?.textContent).toMatch(
      /needs system protocol 99/
    )
    expect(seen().mounted).toBeUndefined()
  })
})
